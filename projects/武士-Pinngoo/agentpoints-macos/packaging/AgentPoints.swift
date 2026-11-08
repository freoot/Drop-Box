import AppKit
import Foundation
import Security
import Darwin

struct AppFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

final class Gateway {
    let directory: URL
    let resources: URL
    var process: Process?
    var logFile: FileHandle?
    var baseURL = URL(string: "http://127.0.0.1:7863")!
    var configURL: URL { directory.appendingPathComponent("config.json") }
    var running: Bool { process?.isRunning == true }

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("AgentPoints")
        self.resources = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
    }

    func configuration() throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: configURL)) as? [String: Any] else {
            throw AppFailure(message: "配置文件格式不正确，请检查 config.json。")
        }
        return value
    }

    func prepare() throws {
        let fm = FileManager.default
        try fm.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        if !fm.fileExists(atPath: configURL.path) {
            var config = try JSONSerialization.jsonObject(with: Data(contentsOf: resources.appendingPathComponent("config.template.json"))) as! [String: Any]
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
                throw AppFailure(message: "无法生成本机访问密钥。")
            }
            config["api_key"] = "ap_" + bytes.map { String(format: "%02x", $0) }.joined()
            try JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted, .sortedKeys]).write(to: configURL, options: .atomic)
        }
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configURL.path)
        let config = try configuration()
        guard let listen = config["listen"] as? String,
              listen.hasPrefix("127.0.0.1:"),
              let port = UInt16(listen.dropFirst("127.0.0.1:".count)), port > 0 else {
            throw AppFailure(message: "Mac 版的 listen 应为 127.0.0.1:端口，例如 127.0.0.1:7863。")
        }
        guard let key = config["api_key"] as? String, !key.isEmpty else {
            throw AppFailure(message: "请在 config.json 中填写非空 api_key。")
        }
        baseURL = URL(string: "http://127.0.0.1:\(port)")!
    }

    func ensurePortAvailable() throws {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw AppFailure(message: "无法检查本机端口。") }
        defer { close(fd) }
        var reuse: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout.size(ofValue: reuse)))
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = UInt16(baseURL.port!).bigEndian
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard result == 0 else {
            throw AppFailure(message: "端口 \(baseURL.port!) 已被占用或不可用。请关闭旧实例，或在配置文件里更换端口。")
        }
    }

    func start() throws {
        if running { return }
        try prepare()
        try ensurePortAvailable()
        let fm = FileManager.default
        let logURL = directory.appendingPathComponent("service.log")
        if let attrs = try? fm.attributesOfItem(atPath: logURL.path),
           let size = attrs[.size] as? NSNumber, size.intValue > 5_000_000 {
            let old = directory.appendingPathComponent("service.previous.log")
            if fm.fileExists(atPath: old.path) { try fm.removeItem(at: old) }
            try fm.moveItem(at: logURL, to: old)
        }
        if !fm.fileExists(atPath: logURL.path) { fm.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
        logFile = try FileHandle(forWritingTo: logURL)
        logFile?.seekToEndOfFile()
        let child = Process()
        child.executableURL = resources.appendingPathComponent("wb2api")
        child.arguments = ["-config", configURL.path]
        child.currentDirectoryURL = directory
        // The desktop app uses its own persisted configuration, not terminal overrides.
        var env = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("WB2A_") && !$0.key.hasPrefix("TW2A_") }
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + (env["PATH"] ?? "")
        child.environment = env
        child.standardOutput = logFile
        child.standardError = logFile
        try child.run()
        process = child
    }

    func request(_ path: String, authenticated: Bool = false) -> (Int, Data) {
        let sem = DispatchSemaphore(value: 0)
        var result: (Int, Data) = (0, Data())
        let config = URLSessionConfiguration.ephemeral
        config.connectionProxyDictionary = [:]
        config.timeoutIntervalForRequest = 1
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        if authenticated, let key = try? configuration()["api_key"] as? String {
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }
        session.dataTask(with: request) { data, response, _ in
            result = ((response as? HTTPURLResponse)?.statusCode ?? 0, data ?? Data())
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 2)
        return result
    }

    func waitUntilReady() throws {
        for _ in 0..<80 {
            guard running else { throw AppFailure(message: "服务启动失败。请打开数据文件夹查看 service.log。") }
            let (code, data) = request("healthz")
            // The upstream service returns 503 until an account has been added.
            if (code == 200 || code == 503),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               json["service"] as? String == "workbuddy2api" { return }
            Thread.sleep(forTimeInterval: 0.15)
        }
        throw AppFailure(message: "服务启动超时。请打开数据文件夹查看 service.log。")
    }

    func stop() {
        if let child = process, child.isRunning {
            child.terminate()
            let deadline = Date().addingTimeInterval(8)
            while child.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
            if child.isRunning { kill(child.processIdentifier, SIGKILL) }
            child.waitUntilExit()
        }
        process = nil
        try? logFile?.close()
        logFile = nil
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let gateway = Gateway()
    var window: NSWindow!
    var statusItem: NSStatusItem!
    var statusLabel: NSTextField!
    var endpointLabel: NSTextField!
    var toggleButton: NSButton!
    var panelButton: NSButton!
    var monitor: Timer?
    var busy = false
    var ready = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenus()
        buildWindow()
        showWindow()
        startGateway()
        monitor = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            guard let self = self, self.ready, !self.busy, !self.gateway.running else { return }
            self.ready = false
            self.update("服务已退出，请重新启动或查看日志。", color: .systemOrange)
        }
    }

    func buildMenus() {
        let menu = NSMenu()
        let root = NSMenuItem()
        menu.addItem(root)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 AgentPoints", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出 AgentPoints", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        root.submenu = appMenu
        NSApp.mainMenu = menu
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "point.3.connected.trianglepath.dotted", accessibilityDescription: "AgentPoints")
        let tray = NSMenu()
        for (title, action) in [("显示 AgentPoints", #selector(showWindow)), ("打开管理面板", #selector(openPanel)), ("复制 API 密钥", #selector(copyKey)), ("打开数据文件夹", #selector(openData))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self
            tray.addItem(item)
        }
        tray.addItem(.separator())
        tray.addItem(withTitle: "退出并停止服务", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        statusItem.menu = tray
    }

    func text(_ value: String, size: CGFloat, weight: NSFont.Weight = .regular, color: NSColor = .labelColor) -> NSTextField {
        let label = NSTextField(wrappingLabelWithString: value)
        label.font = .systemFont(ofSize: size, weight: weight)
        label.textColor = color
        return label
    }

    func button(_ title: String, _ action: Selector) -> NSButton {
        let b = NSButton(title: title, target: self, action: action)
        b.bezelStyle = .rounded
        b.controlSize = .large
        return b
    }

    func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 620, height: 430), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "AgentPoints"
        window.isReleasedWhenClosed = false
        window.center()
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -32),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 30)
        ])
        stack.addArrangedSubview(text("AgentPoints", size: 30, weight: .bold))
        stack.addArrangedSubview(text("Mac 本地网关 · 基于 WorkBuddy2API Panel", size: 14, color: .secondaryLabelColor))
        statusLabel = text("正在启动本地服务…", size: 15, weight: .medium)
        stack.addArrangedSubview(statusLabel)
        endpointLabel = text("API 地址  http://127.0.0.1:7863/v1", size: 14)
        endpointLabel.isSelectable = true
        stack.addArrangedSubview(endpointLabel)
        let row = NSStackView()
        row.spacing = 10
        panelButton = button("打开管理面板", #selector(openPanel))
        panelButton.keyEquivalent = "\r"
        toggleButton = button("停止服务", #selector(toggleService))
        row.addArrangedSubview(panelButton)
        row.addArrangedSubview(toggleButton)
        stack.addArrangedSubview(row)
        let row2 = NSStackView()
        row2.spacing = 10
        row2.addArrangedSubview(button("复制 API 密钥", #selector(copyKey)))
        row2.addArrangedSubview(button("复制 API 地址", #selector(copyEndpoint)))
        row2.addArrangedSubview(button("数据文件夹", #selector(openData)))
        stack.addArrangedSubview(row2)
        let help = text("首次使用：复制密钥 → 打开管理面板 → 粘贴密钥并添加自己的账号。\n\n关闭这个窗口后，服务继续在菜单栏运行；退出应用会停止服务。", size: 13, color: .secondaryLabelColor)
        stack.addArrangedSubview(help)
        help.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
    }

    func update(_ message: String, color: NSColor = .labelColor) {
        statusLabel.stringValue = message
        statusLabel.textColor = color
        endpointLabel.stringValue = "API 地址  \(gateway.baseURL.absoluteString)/v1"
        toggleButton.title = gateway.running ? "停止服务" : "启动服务"
        toggleButton.isEnabled = !busy
        panelButton.isEnabled = ready && !busy
        statusItem.button?.toolTip = "AgentPoints · \(message)"
    }

    func startGateway() {
        guard !busy else { return }
        busy = true
        ready = false
        update("正在启动本地服务…")
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.gateway.start()
                try self.gateway.waitUntilReady()
                DispatchQueue.main.async {
                    self.busy = false
                    self.ready = true
                    self.update("● 服务已启动 · 可打开面板添加账号", color: .systemGreen)
                }
            } catch {
                self.gateway.stop()
                DispatchQueue.main.async {
                    self.busy = false
                    self.update(error.localizedDescription, color: .systemRed)
                }
            }
        }
    }

    @objc func toggleService() {
        guard !busy else { return }
        if !gateway.running { startGateway(); return }
        busy = true
        ready = false
        update("正在停止服务…")
        DispatchQueue.global(qos: .userInitiated).async {
            self.gateway.stop()
            DispatchQueue.main.async {
                self.busy = false
                self.update("服务已停止", color: .secondaryLabelColor)
            }
        }
    }

    @objc func showWindow() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc func openPanel() {
        guard ready, gateway.running else { showWindow(); return }
        NSWorkspace.shared.open(gateway.baseURL.appendingPathComponent("panel/"))
    }
    @objc func openData() { NSWorkspace.shared.open(gateway.directory) }
    func copy(_ value: String) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string) }
    @objc func copyKey() {
        if let key = try? gateway.configuration()["api_key"] as? String { copy(key) }
    }
    @objc func copyEndpoint() { copy(gateway.baseURL.absoluteString + "/v1") }
    @objc func about() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "AgentPoints", .applicationVersion: "1.0.0 · 核心 1.11.10-panel",
            .credits: NSAttributedString(string: "Mac 本地启动器\n基于 WorkBuddy2API Panel\n原作者：Sliverkiss / linguo2625469\nMIT License（随应用附带）")
        ])
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // Do not race an in-progress start/stop operation.
        if busy { return .terminateCancel }
        busy = true
        monitor?.invalidate()
        update("正在退出并停止服务…")
        DispatchQueue.global(qos: .userInitiated).async {
            self.gateway.stop()
            DispatchQueue.main.async { sender.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }
}

func selfTest() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("agentpoints-test-\(UUID().uuidString)")
    let gateway = Gateway(directory: dir)
    defer { gateway.stop(); try? FileManager.default.removeItem(at: dir) }
    try gateway.prepare()
    var config = try gateway.configuration()
    let key = config["api_key"] as! String
    guard key.hasPrefix("ap_"), key.count == 67 else { throw AppFailure(message: "Key generation failed") }
    // Use a temporary OS-assigned port, leaving the user's real port and data alone.
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else { throw AppFailure(message: "Test socket failed") }
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let bound = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    guard bound == 0 else { close(fd); throw AppFailure(message: "Test bind failed") }
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &length) } }
    let port = UInt16(bigEndian: address.sin_port)
    close(fd)
    config["listen"] = "127.0.0.1:\(port)"
    if var trae = config["trae"] as? [String: Any] { trae["callback_port"] = "0"; config["trae"] = trae }
    try JSONSerialization.data(withJSONObject: config).write(to: gateway.configURL, options: .atomic)
    try gateway.start()
    try gateway.waitUntilReady()
    print("PASS: bundled backend starts; correct service identity (empty-account 503 accepted)")
    guard gateway.request("panel/").0 == 200 else { throw AppFailure(message: "Panel did not load") }
    guard gateway.request("panel/app.js").0 == 200 else { throw AppFailure(message: "Panel JavaScript did not load") }
    print("PASS: management panel and JavaScript served")
    guard gateway.request("panel/api/overview").0 == 401 else { throw AppFailure(message: "Unauthenticated panel access not rejected") }
    guard gateway.request("panel/api/overview", authenticated: true).0 == 200 else { throw AppFailure(message: "Authenticated overview failed") }
    guard gateway.request("v1/models", authenticated: true).0 == 200 else { throw AppFailure(message: "Models endpoint failed") }
    print("PASS: API authentication, overview and OpenAI-compatible model list")
    let other = Gateway(directory: dir)
    do { try other.start(); other.stop(); throw AppFailure(message: "Port conflict not detected") }
    catch let err as AppFailure { guard err.message.contains("端口") else { throw err } }
    print("PASS: second instance detects occupied port without taking over")
    gateway.stop()
    guard !gateway.running, gateway.request("healthz").0 == 0 else { throw AppFailure(message: "Backend remained running") }
    try gateway.start()
    try gateway.waitUntilReady()
    guard try gateway.configuration()["api_key"] as? String == key else { throw AppFailure(message: "Key changed on restart") }
    gateway.stop()
    print("PASS: graceful stop and restart preserve configuration")
    let permissions = try FileManager.default.attributesOfItem(atPath: gateway.configURL.path)[.posixPermissions] as? NSNumber
    guard permissions?.intValue == 0o600 else { throw AppFailure(message: "Configuration permissions are not 0600") }
    print("PASS: private configuration permissions; no user account required")
}

if CommandLine.arguments.contains("--self-test") {
    do { try selfTest(); exit(0) }
    catch { fputs("FAIL: \(error.localizedDescription)\n", stderr); exit(1) }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
