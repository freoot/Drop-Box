// index.go 面板静态资源与安全响应头。
//
// 资源经 go:embed 打进二进制（随服务部署，无外部构建步骤）：
//   - index.html  页面骨架
//   - app.js      全部前端逻辑（独立文件而非内联，为了启用无需 unsafe-inline 的严格 CSP）
//
// 安全头对"面板页面与全部 /panel/api/* 响应"统一生效：CSP 限制脚本只能来自本服务，
// 禁止被 iframe 嵌套（防点击劫持），禁 MIME 嗅探，并声明不泄露 Referer 出去。
package panel

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"net/http"
	"strings"
)

//go:embed index.html
var indexHTML []byte

//go:embed app.js
var appJS []byte

// csp 内容安全策略（严格版，无需 unsafe-inline）：
//   - default-src 'none'        默认全禁，逐个开口
//   - script-src 'self'         只跑同源脚本（app.js）；页面无内联事件处理器/内联脚本
//   - style-src 'self' 'unsafe-inline'
//     style 的内联是设计取舍：页面有少量 style="..." 属性（进度条宽度、表格列宽），
//     允许内联样式不会导致脚本执行；仍禁止外部样式域与 @import 外链。
//   - connect-src 'self'        前端 fetch 只能打本服务
//   - img-src 'self' data:      图标/内联图
//   - form-action 'none'        页面无表单提交目标（配置页是 JS 提交）
//   - frame-ancestors 'none'    禁止被任何站点 iframe 嵌套（点击劫持）
//   - base-uri 'none'          禁止注入 <base> 改写相对路径
const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"connect-src 'self'; img-src 'self' data:; form-action 'none'; " +
	"frame-ancestors 'none'; base-uri 'none'"

// setSecurityHeaders 写入面板统一安全响应头（页面与 API 都要，API 也含 JSON 数据）。
func setSecurityHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Security-Policy", csp)
	w.Header().Set("X-Content-Type-Options", "nosniff") // 禁 MIME 嗅探
	w.Header().Set("X-Frame-Options", "DENY")           // 老浏览器兜底（CSP frame-ancestors 的等价项）
	w.Header().Set("Referrer-Policy", "no-referrer")    // 不外泄面板地址给外部站点
	w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
}

// writeAsset 输出静态资源：ETag（内容指纹）+ Cache-Control: no-cache。
//
// 为什么不能裸写：这些响应原先没有任何缓存头，浏览器会按启发式规则长时间沿用
// 旧的 app.js / index.html —— 服务端已经改好、用户却一直看到旧界面（点按钮没反应、
// 新功能不出现），排查成本极高。no-cache 允许缓存但每次必须回源校验，配合 ETag
// 命中即 304，既不牺牲带宽也不会再发旧版本。
func writeAsset(w http.ResponseWriter, r *http.Request, contentType, etag string, body []byte) {
	setSecurityHeaders(w)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-cache, must-revalidate")
	w.Header().Set("ETag", etag)
	if inm := r.Header.Get("If-None-Match"); inm != "" && strings.Contains(inm, etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// etagOf 内容指纹（强 ETag）。资源随二进制发布，内容变则指纹变。
func etagOf(b []byte) string {
	sum := sha256.Sum256(b)
	return `"` + hex.EncodeToString(sum[:8]) + `"`
}

var (
	indexETag = etagOf(indexHTML)
	appJSEtag = etagOf(appJS)
)

// index 输出面板页面（静态无秘密；数据接口 /panel/api/* 才走鉴权）。
func (p *Panel) index(w http.ResponseWriter, r *http.Request) {
	writeAsset(w, r, "text/html; charset=utf-8", indexETag, indexHTML)
}

// appScript 输出前端逻辑（同源脚本，供 CSP script-src 'self' 加载）。
func (p *Panel) appScript(w http.ResponseWriter, r *http.Request) {
	writeAsset(w, r, "text/javascript; charset=utf-8", appJSEtag, appJS)
}
