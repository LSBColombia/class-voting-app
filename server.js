// Simple CSV export (fixed)
app.get('/admin/poll/:id/export', (req, res) => {
  if (!isAdmin(req)) return res.status(401).send('Unauthorized');
  const pollId = parseInt(req.params.id);
  const rows = db.prepare(`
    SELECT voters.name, options.label as choice, votes.created_at
    FROM votes
    JOIN voters ON voters.id = votes.voter_id
    JOIN options ON options.id = votes.option_id
    WHERE votes.poll_id = ?
    ORDER BY votes.id ASC
  `).all(pollId);

  // Escapar comillas y armar filas
  const csvRows = rows.map(r => {
    const n = (r.name || '').replace(/"/g, '""');
    const c = (r.choice || '').replace(/"/g, '""');
    const t = (r.created_at || '').replace(/"/g, '""');
    return `"${n}","${c}","${t}"`;
  });

  const csv = ['name,choice,created_at', ...csvRows].join('\n');
  res.setHeader('Content-Disposition', `attachment; filename="poll-${pollId}.csv"`);
  res.type('text/csv').send(csv);
});
