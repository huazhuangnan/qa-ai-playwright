/** Read-only API reference rendered from the same OpenAPI endpoint as clients. */
export const apiDocsHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QA Ticket API 文档</title>
  <style>
    body { font: 16px system-ui, sans-serif; max-width: 72rem; margin: 2rem auto; padding: 0 1rem; color: #17202a; }
    section { border-top: 1px solid #ccd1d1; padding: 0.5rem 0; }
    code { background: #eef2f3; padding: 0.2rem; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f6f8fa; padding: 1rem; }
  </style>
</head>
<body>
  <h1>QA Ticket API 文档</h1>
  <p>只读参考。<a href="/openapi.json">下载 OpenAPI JSON</a></p>
  <p id="status" role="status">正在读取契约…</p>
  <main id="operations"></main>
  <h2>共享类型、认证与响应</h2>
  <pre id="components"></pre>
  <script>
    fetch('/openapi.json').then(response => {
      if (!response.ok) throw new Error('契约不可用');
      return response.json();
    }).then(spec => {
      document.querySelector('#status').textContent = spec.info.title + ' · ' + spec.info.version;
      document.querySelector('#components').textContent = JSON.stringify(spec.components, null, 2);
      const container = document.querySelector('#operations');
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (!['get', 'post', 'patch', 'delete', 'put'].includes(method)) continue;
          const section = document.createElement('section');
          const title = document.createElement('h2');
          title.textContent = method.toUpperCase() + ' ' + path + ' · ' + operation.summary;
          const details = document.createElement('pre');
          details.textContent = JSON.stringify(operation, null, 2);
          section.append(title, details);
          container.append(section);
        }
      }
    }).catch(() => {
      document.querySelector('#status').textContent = '无法读取 OpenAPI 契约。';
    });
  </script>
</body>
</html>`;
