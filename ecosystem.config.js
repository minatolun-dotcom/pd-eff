module.exports = {
  apps: [
    {
      name: 'pd-eff-backend',
      cwd: '/home/khuptong/project/pd-eff/pdf-signer-app/backend',
      script: './venv/bin/uvicorn',
      args: 'pdf_signer.main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: 'pd-eff-frontend',
      cwd: '/home/khuptong/project/pd-eff/pdf-signer-app/frontend',
      script: 'npm',
      args: 'run dev',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
