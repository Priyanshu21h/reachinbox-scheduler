const repoRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'reachinbox-api',
      cwd: repoRoot,
      script: 'npm',
      args: ['run', 'start', '--workspace=apps/api'],
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
        TRUST_PROXY_HOPS: '1',
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
    {
      name: 'reachinbox-worker',
      cwd: repoRoot,
      script: 'npm',
      args: ['run', 'start', '--workspace=apps/worker'],
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      time: true,
    },
  ],
};
