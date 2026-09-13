# Lably Backend

Express and MongoDB API for the Lably application.

## Prerequisites

- Node.js 18 or newer
- npm
- A MongoDB connection string
- Credentials for the services used by the application (Resend and Supabase)

## Clone and install



```bash
git clone https://github.com/ElvonAbu/lablybackend.git
cd backend
npm install
```

If the repository contains the backend in a subdirectory, change into that directory before running `npm install`.

## Environment variables

Create a file named `.env` in the backend directory. Do not commit this file or share its values in source control.

```env
databaseurl=<mongodb-connection-string>
jwtkey=<jwt-signing-secret>
resendkey=<resend-api-key>
subapaseprojurl=<supabase-project-url>
supabasekey=<supabase-service-key>
supabasepubkey=<supabase-publishable-key>
```

The current code uses `databaseurl`, `jwtkey`, `resendkey`, and the Supabase variables during startup and authentication flows. Use the exact lowercase names shown above. Ask the project owner for development credentials; never reuse credentials from another environment.

## Run the server

For development, with automatic restart:

```bash
npm run server
```

To start Node directly:

```bash
node index.js
```

The API starts on `http://localhost:3000` after a successful MongoDB connection. The configured frontend origin is `http://localhost:5173`.

Check that the server is running:

```bash
curl http://localhost:3000/
```

Expected response:

```json
{"message":"Api works"}
```

## API routes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/login` | Log in with credentials |
| `GET` | `/login/loginwithgoogle` | Start Google login |
| `POST` | `/signup` | Create an account and sends OTP to first Timers|
| `GET` | `/signup/signupwithgoogle` | Start Google signup |
| `GET` | `/signup/getusers` | Get users |
| `POST` | `/verifyemailaddress/` | Verify an OTP |
| `POST` | `/forgotpassword` | Send a password-reset OTP |
| `POST` | `/forgotpassword/verify` | Verify a password-reset OTP |

Most `POST` endpoints expect JSON request bodies. Send the `Content-Type: application/json` header when calling them.

## Project structure

- `index.js` - loads configuration, connects to MongoDB, and starts Express
- `routes/` - API route definitions
- `middlewares/` - authentication and request-processing logic
- `models/` - Mongoose models
- `uploads/` and `uploadeddocuments/` - local uploaded files; do not commit generated content

## Troubleshooting

- **Database connection error:** verify `databaseurl`, network access, and MongoDB permissions.
- **Missing configuration:** confirm the file is named `.env`, is in the backend directory, and uses the exact variable names above.
- **Frontend CORS error:** run the frontend on `http://localhost:5173`, or update the CORS origin in `index.js` for your local frontend URL.
- **Port already in use:** stop the process using port `3000`; the port is currently defined directly in `index.js`.

## Security note

The `.env` file is ignored by Git, but any credentials that have been exposed or committed previously should be revoked and replaced. Keep production secrets in a managed secret store rather than in the repository or a shared chat.