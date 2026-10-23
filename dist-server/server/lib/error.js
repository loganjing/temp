export function error(c, status, code, message) {
    return c.json({ error: { code, message } }, status);
}
