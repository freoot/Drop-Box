"""Optional system network transport. Credentials arrive on stdin, never argv."""
import base64
import json
import sys
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    spec = json.load(sys.stdin)
    body = spec.get("body")
    request = urllib.request.Request(
        spec["url"], data=body.encode() if body is not None else None,
        headers=spec.get("headers", {}), method=spec.get("method", "GET"),
    )
    try:
        response = urllib.request.build_opener(NoRedirect()).open(request, timeout=180)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = response.read(150 * 1024 * 1024 + 1)
        if len(data) > 150 * 1024 * 1024:
            raise ValueError("response_too_large")
        metadata = {"status": response.status, "headers": dict(response.headers.items())}
        sys.stdout.buffer.write(json.dumps(metadata).encode() + b"\n" + data)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Do not print exception messages containing request headers or signed URLs.
        sys.stderr.write("upstream_transport_failed\n")
        sys.exit(1)
