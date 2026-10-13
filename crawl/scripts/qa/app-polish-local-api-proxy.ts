// Transparent loopback transport for the isolated Edge container only.
// No canned responses/auth bypass: every request reaches actual Kong/Auth/REST/Storage.
Deno.serve(async request => {
  const url = new URL(request.url);
  url.protocol = 'http:';
  url.hostname = 'kong';
  url.port = '8000';
  return await fetch(new Request(url, request));
});
