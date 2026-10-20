export function downloadWorld(buffer, filename) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
