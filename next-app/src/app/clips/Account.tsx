'use client';
import { useState } from 'react';
import { createAuthClient } from 'better-auth/react';
const auth = createAuthClient();
export function SignOut({ email }: { email: string }) {
  return (
    <div className="clip-row">
      <small>{email}</small>
      <button
        className="clip-link"
        onClick={async () => {
          const r = await auth.signOut();
          if (!r.error) location.reload();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
export function AccountForm() {
  const [newUser, setNew] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="page-container clips">
      <section className="glass-card clip-controls" style={{ maxWidth: 440, margin: '4rem auto' }}>
        <h1>{newUser ? 'Create an account' : 'Sign in to Clips'}</h1>
        <form
          className="clip-account"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const f = new FormData(e.currentTarget);
            const credentials = { email: String(f.get('email')), password: String(f.get('password')) };
            try {
              const r = newUser
                ? await auth.signUp.email({ ...credentials, name: String(f.get('name')) })
                : await auth.signIn.email(credentials);
              if (r.error) throw Error(r.error.message || 'Sign-in failed.');
              location.reload();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not connect.');
              setBusy(false);
            }
          }}
        >
          {newUser && (
            <label>
              Name
              <input className="input" name="name" autoComplete="name" required />
            </label>
          )}
          <label>
            Email
            <input className="input" name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              className="input"
              name="password"
              type="password"
              autoComplete={newUser ? 'new-password' : 'current-password'}
              minLength={newUser ? 8 : 1}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {newUser ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          className="clip-link"
          onClick={() => {
            setNew(!newUser);
            setError('');
          }}
        >
          {newUser ? 'Use an existing account' : 'Sign up'}
        </button>
      </section>
    </div>
  );
}
