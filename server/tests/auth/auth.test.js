require("dotenv/config");

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { app } = require("../../dist/server");
const { prisma } = require("../../dist/config/database");

let server;
let baseUrl;

function request(path, options = {}) {
  const { body, headers, ...rest } = options;
  return fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("authentication and user management flows", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `auth-${suffix}@example.test`;
  const password = "Correct Horse Battery Staple";
  const newPassword = "A Different Secure Passphrase";

  const registration = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Auth Test", email, password, preferredLanguage: "en" },
  });
  assert.equal(registration.status, 201);
  const registered = await registration.json();
  assert.equal(registered.data.user.email, email);
  assert.equal("passwordHash" in registered.data.user, false);

  const duplicate = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Auth Test", email, password },
  });
  assert.equal(duplicate.status, 409);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(login.status, 200);
  const credentials = await login.json();
  assert.ok(credentials.data.accessToken);
  assert.ok(credentials.data.refreshToken);

  const me = await request("/api/v1/users/me", {
    headers: { authorization: `Bearer ${credentials.data.accessToken}` },
  });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.user.email, email);

  const invalidAuth = await request("/api/v1/users/me", {
    headers: { authorization: "Bearer malformed" },
  });
  assert.equal(invalidAuth.status, 401);

  const update = await request("/api/v1/users/me", {
    method: "PATCH",
    headers: { authorization: `Bearer ${credentials.data.accessToken}` },
    body: { fullName: "Updated Auth Test" },
  });
  assert.equal(update.status, 200);

  const refreshed = await request("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken: credentials.data.refreshToken },
  });
  assert.equal(refreshed.status, 200);
  const rotated = await refreshed.json();
  assert.notEqual(rotated.data.refreshToken, credentials.data.refreshToken);

  const reused = await request("/api/v1/auth/refresh", {
    method: "POST",
    body: { refreshToken: credentials.data.refreshToken },
  });
  assert.equal(reused.status, 401);
  assert.equal((await prisma.refreshToken.count({ where: { userId: registered.data.user.id, revokedAt: null } })), 0);

  const relogin = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const reloginCredentials = await relogin.json();
  const passwordChange = await request("/api/v1/users/me/password", {
    method: "PATCH",
    headers: { authorization: `Bearer ${reloginCredentials.data.accessToken}` },
    body: { currentPassword: password, newPassword },
  });
  assert.equal(passwordChange.status, 200);
  assert.equal((await prisma.refreshToken.count({ where: { userId: registered.data.user.id, revokedAt: null } })), 0);

  const oldLogin = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(oldLogin.status, 401);
  const finalLogin = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password: newPassword },
  });
  assert.equal(finalLogin.status, 200);
  const finalCredentials = await finalLogin.json();

  const concurrentLogin = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password: newPassword },
  });
  const concurrentCredentials = await concurrentLogin.json();
  const concurrentResults = await Promise.all([
    request("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken: concurrentCredentials.data.refreshToken },
    }),
    request("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken: concurrentCredentials.data.refreshToken },
    }),
  ]);
  assert.deepEqual(concurrentResults.map((result) => result.status).sort(), [200, 401]);

  const deletionLogin = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password: newPassword },
  });
  const deletionCredentials = await deletionLogin.json();
  const deletion = await request("/api/v1/users/me", {
    method: "DELETE",
    headers: { authorization: `Bearer ${deletionCredentials.data.accessToken}` },
    body: { currentPassword: newPassword, confirmation: "DELETE" },
  });
  assert.equal(deletion.status, 200);
  assert.equal(await prisma.user.findUnique({ where: { id: registered.data.user.id } }), null);
});
