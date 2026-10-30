// The app has no login because it is meant to be used only from the browser
// on the same machine. This makes that true: the server only answers requests
// addressed to localhost (blocks DNS rebinding), from its own page (blocks
// other websites), and every write must be JSON (a cross-site HTML form can't
// send that without the browser asking first, which is then refused).
function localOnly(port) {
  const allowed = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  return (req, res, next) => {
    if (!allowed.has(req.headers.host)) {
      return res.status(403).json({ error: 'This app only accepts requests from this computer.' });
    }

    const origin = req.headers.origin;
    if (origin && !allowed.has(origin.replace(/^https?:\/\//, ''))) {
      return res.status(403).json({ error: 'Requests from other websites are not allowed.' });
    }

    const contentType = req.headers['content-type'] || '';
    if (!SAFE_METHODS.has(req.method) && !contentType.startsWith('application/json')) {
      return res.status(415).json({ error: 'Changes must be sent as JSON.' });
    }

    next();
  };
}

module.exports = { localOnly };
