function tenantMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] || (req.user && req.user.tenant_id);
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' });
  }
  req.tenantId = parseInt(tenantId, 10);
  next();
}

module.exports = tenantMiddleware;
