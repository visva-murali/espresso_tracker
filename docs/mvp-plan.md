# Espresso Shot Tracker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 espresso shot tracker: a multi-user web app where a signed-in user can log a shot (required numbers plus optional context and video), see their own shot history, edit or delete past shots, and play back an attached pour video, with isolation between users enforced at the database level.

**Architecture:** React + Vite single-page app talking directly to Supabase (Postgres + Auth + Storage) from the browser, no custom backend. Row-Level Security policies on every table and the storage bucket enforce that a user can only ever read or write their own rows. Video files upload directly from the browser to Supabase Storage via a signed URL; the `videos` table is a separate entity from `shots` so a future CV pipeline can attach analysis data without touching the shots schema.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, React Router, Supabase (`@supabase/supabase-js`), Supabase CLI for local dev and migrations, Vitest and React Testing Library for tests, Vercel for hosting.

**Spec:** `docs/mvp_spec.md` and `docs/mvp-design.md` (design doc this plan implements; read both before starting).

## Global Constraints

- Stack is fixed: React + Vite + TypeScript, Tailwind CSS, Supabase (Postgres + Auth + Storage + RLS), Vercel hosting, Google OAuth via Supabase Auth. No custom backend or API layer - the frontend talks to Supabase directly.
- Row-Level Security must be enabled and enforced on every table and on the storage bucket. Never rely on app-layer checks alone for isolation - that requirement is tested explicitly in Task 3.
- Video handling: file-picker upload only, no in-browser recording. Direct-to-storage upload via signed URL. No transcoding - original bytes are preserved. Soft cap of 500MB / 3 minutes, validated client-side before upload starts.
- Free-tier services only (Supabase free tier, Vercel free tier).
- No em dashes anywhere in code comments, docs, commit messages, or written output - use a regular hyphen or restructure the sentence.
- Do not add or reference time estimates anywhere in this plan, in code comments, or in status updates.
- `grind_setting` is free text, not numeric. `bean_name` and `roast_date` are plain fields on `shots`, not a separate reusable table.
- Local development and testing require the Supabase CLI and Docker (the CLI uses Docker to run a local Postgres/Auth/Storage stack for `supabase start`).

---

## File Structure Overview

```
espresso_tracker/
  src/
    lib/
      supabaseClient.ts   Supabase client singleton, reads env vars
      shots.ts            CRUD functions for the shots table
      shots.test.ts        integration tests against local Supabase
      videos.ts            video validation, upload, signed playback URL
      videos.test.ts       unit tests for validation logic
    context/
      AuthContext.tsx      auth state, sign in with Google, sign out
      AuthContext.test.tsx
    components/
      ProtectedRoute.tsx   redirects to /login when signed out
      ShotForm.tsx          shared form used by New and Edit shot pages
      ShotForm.test.tsx
    pages/
      LoginPage.tsx
      HomePage.tsx          placeholder, replaced by ShotListPage in Task 7
      ShotListPage.tsx
      ShotListPage.test.tsx
      NewShotPage.tsx
      NewShotPage.test.tsx
      ShotDetailPage.tsx
      ShotDetailPage.test.tsx
      EditShotPage.tsx
      EditShotPage.test.tsx
    App.tsx
    App.test.tsx
    test/
      setup.ts              jest-dom matchers, loads .env.test.local if present
  supabase/
    migrations/
      00000000000001_shots_and_videos.sql
      00000000000002_video_storage.sql
  tests/
    integration/
      rls.test.ts           cross-user isolation tests, raw supabase-js calls
  vite.config.ts
  package.json
  .env (gitignored, cloud project credentials)
  .env.test.local (gitignored, local Supabase credentials for tests)
```

Each task below lists exactly which of these files it creates or modifies.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `src/test/setup.ts`
- Create: `src/App.test.tsx`
- Modify: `.gitignore` (add `node_modules/`, `dist/`)

**Interfaces:**
- Produces: `App` default export from `src/App.tsx`, rendering a placeholder div. Later tasks replace its contents.

- [ ] **Step 1: Scaffold the Vite React TypeScript project**

```bash
npm create vite@latest . -- --template react-ts
npm install
```

- [ ] **Step 2: Install Tailwind, testing, and routing dependencies**

```bash
npm install react-router-dom @supabase/supabase-js
npm install -D tailwindcss @tailwindcss/vite vitest @testing-library/react @testing-library/jest-dom jsdom dotenv
```

- [ ] **Step 3: Configure Tailwind and Vitest in `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 4: Write the test setup file**

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test.local' });
```

- [ ] **Step 5: Replace `src/index.css` with Tailwind's import**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Write the failing smoke test**

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText(/espresso shot tracker/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run`
Expected: FAIL, no element with that text exists yet.

- [ ] **Step 8: Write the minimal `App.tsx`**

```tsx
// src/App.tsx
export default function App() {
  return <div>Espresso Shot Tracker</div>;
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 10: Add `node_modules/` and `dist/` to `.gitignore`, commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TypeScript project with Tailwind and Vitest"
```

---

### Task 2: Supabase project setup, local dev environment, and client wrapper

This task has manual steps that only a human can complete (creating accounts, clicking through dashboards). If you are an agent executing this plan, stop at each manual step, tell the user exactly what to do, and wait for them to confirm it is done and give you the resulting values before continuing.

**Files:**
- Create: `src/lib/supabaseClient.ts`
- Create: `.env` (gitignored, already covered by the existing `.env.*` pattern)
- Modify: `.gitignore` (add `supabase/.branches`, `supabase/.temp` if not already covered)

**Interfaces:**
- Produces: `supabase` export from `src/lib/supabaseClient.ts`, a configured `SupabaseClient` instance used by every data-access module in later tasks.

- [ ] **Step 1: Manual: create the Supabase project**

Tell the user: go to supabase.com, sign up or sign in, create a new project (any region, free tier). Once created, open Project Settings > API and copy the Project URL and the anon public key. Confirm with the user that they have these two values before continuing.

- [ ] **Step 2: Install the Supabase CLI and initialize local config**

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 3: Write `.env` with the cloud project credentials**

```
VITE_SUPABASE_URL=<the project URL from Step 1>
VITE_SUPABASE_ANON_KEY=<the anon key from Step 1>
```

- [ ] **Step 4: Write the Supabase client wrapper**

```typescript
// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, anonKey);
```

- [ ] **Step 5: Start the local Supabase stack and capture local credentials**

```bash
npx supabase start
```

Expected: output lists a local API URL (normally `http://127.0.0.1:54321`), an anon key, and a service_role key. These are fixed local-only development defaults, not secrets - write them into `.env.test.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key from the command output>
SUPABASE_LOCAL_SERVICE_ROLE_KEY=<local service_role key from the command output>
```

- [ ] **Step 6: Verify `.gitignore` covers both env files and Supabase local artifacts**

Confirm `.env.*` is present (it already is). Add if missing:

```
supabase/.branches
supabase/.temp
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client wrapper and local dev configuration"
```

---

### Task 3: Database schema, Row-Level Security, and cross-user isolation tests

**Files:**
- Create: `supabase/migrations/00000000000001_shots_and_videos.sql`
- Create: `supabase/migrations/00000000000002_video_storage.sql`
- Create: `tests/integration/rls.test.ts`

**Interfaces:**
- Produces: `shots` and `videos` tables matching the schema in `docs/mvp-design.md` section 4, a `pour-videos` storage bucket, and RLS policies restricting every operation to the owning user. Later tasks' data-access functions assume these tables and policies exist exactly as defined here.

- [ ] **Step 1: Write the schema and RLS migration**

```sql
-- supabase/migrations/00000000000001_shots_and_videos.sql

create table shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grind_setting text not null,
  dose_g numeric not null,
  yield_g numeric not null,
  pull_time_s numeric not null,
  bean_name text,
  roast_date date,
  rating smallint,
  tasting_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shots_user_id_created_at_idx on shots (user_id, created_at desc);

alter table shots enable row level security;

create policy "shots_select_own" on shots for select using (auth.uid() = user_id);
create policy "shots_insert_own" on shots for insert with check (auth.uid() = user_id);
create policy "shots_update_own" on shots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "shots_delete_own" on shots for delete using (auth.uid() = user_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shots_set_updated_at
before update on shots
for each row execute function set_updated_at();

create table videos (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null unique references shots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null default now()
);

create index videos_user_id_idx on videos (user_id);

alter table videos enable row level security;

create policy "videos_select_own" on videos for select using (auth.uid() = user_id);
create policy "videos_insert_own" on videos for insert with check (auth.uid() = user_id);
create policy "videos_update_own" on videos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "videos_delete_own" on videos for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Write the storage bucket and policy migration**

```sql
-- supabase/migrations/00000000000002_video_storage.sql

insert into storage.buckets (id, name, public)
values ('pour-videos', 'pour-videos', false)
on conflict (id) do nothing;

create policy "pour_videos_select_own" on storage.objects
for select using (
  bucket_id = 'pour-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "pour_videos_insert_own" on storage.objects
for insert with check (
  bucket_id = 'pour-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "pour_videos_delete_own" on storage.objects
for delete using (
  bucket_id = 'pour-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

- [ ] **Step 3: Apply the migrations locally**

```bash
npx supabase db reset
```

Expected: both migrations run without error against the local stack.

- [ ] **Step 4: Write the failing isolation test**

```typescript
// tests/integration/rls.test.ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!;

async function createTestUserClient(email: string) {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  });
  if (error) throw error;

  const client = createClient(LOCAL_URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: 'test-password-123',
  });
  if (signInError) throw signInError;

  return { client, userId: data.user!.id };
}

describe('shots RLS isolation', () => {
  it('user cannot select another user\'s shot', async () => {
    const a = await createTestUserClient(`rls-a-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-b-${Date.now()}@test.local`);

    const { data: shot, error: insertError } = await a.client
      .from('shots')
      .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: a.userId })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByB, error: selectError } = await b.client
      .from('shots')
      .select()
      .eq('id', shot!.id);

    expect(selectError).toBeNull();
    expect(seenByB).toEqual([]);
  });

  it('user cannot update or delete another user\'s shot', async () => {
    const a = await createTestUserClient(`rls-c-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-d-${Date.now()}@test.local`);

    const { data: shot } = await a.client
      .from('shots')
      .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: a.userId })
      .select()
      .single();

    const { data: updated } = await b.client
      .from('shots')
      .update({ grind_setting: '99' })
      .eq('id', shot!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await b.client
      .from('shots')
      .delete()
      .eq('id', shot!.id)
      .select();
    expect(deleted).toEqual([]);

    const { data: stillThere } = await a.client
      .from('shots')
      .select()
      .eq('id', shot!.id)
      .single();
    expect(stillThere?.grind_setting).toBe('18');
  });
});

describe('videos RLS isolation', () => {
  it('user cannot select another user\'s video row', async () => {
    const a = await createTestUserClient(`rls-e-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-f-${Date.now()}@test.local`);

    const { data: shot } = await a.client
      .from('shots')
      .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: a.userId })
      .select()
      .single();

    const { data: video, error: videoInsertError } = await a.client
      .from('videos')
      .insert({
        shot_id: shot!.id,
        user_id: a.userId,
        storage_key: `${a.userId}/${shot!.id}/test.mp4`,
        content_type: 'video/mp4',
        size_bytes: 1000,
      })
      .select()
      .single();
    expect(videoInsertError).toBeNull();

    const { data: seenByB } = await b.client
      .from('videos')
      .select()
      .eq('id', video!.id);
    expect(seenByB).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the tests, they should already pass against a correctly configured local stack**

Run: `npx vitest run tests/integration/rls.test.ts`
Expected: PASS, all three tests. If any test fails with data visible across users, the RLS policies in Step 1/2 are wrong. Do not proceed until this passes - this is the automated proof for the "never see another user's data" requirement.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add shots and videos schema with RLS, verified by isolation tests"
```

---

### Task 4: Google OAuth, auth context, protected routes, and routing shell

This task has manual external configuration steps. If you are an agent executing this plan, stop at the manual step, tell the user exactly what to do, and wait for confirmation before continuing.

**Files:**
- Create: `src/context/AuthContext.tsx`, `src/context/AuthContext.test.tsx`
- Create: `src/components/ProtectedRoute.tsx`
- Create: `src/pages/LoginPage.tsx`, `src/pages/HomePage.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Produces: `useAuth()` hook returning `{ user: User | null, loading: boolean, signInWithGoogle: () => Promise<void>, signOut: () => Promise<void> }`, from `src/context/AuthContext.tsx`. `ProtectedRoute` component wrapping children that require a signed-in user.
- Consumes: `supabase` from `src/lib/supabaseClient.ts` (Task 2).

- [ ] **Step 1: Manual: register a Google OAuth client and enable it in Supabase**

Tell the user: in Google Cloud Console, create an OAuth 2.0 Client ID of type Web application. Add this authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (project ref is in the Supabase project URL). Copy the resulting Client ID and Client Secret. Then in the Supabase dashboard, go to Authentication > Providers > Google, paste both values, and enable the provider. Also set Authentication > URL Configuration's Site URL to `http://localhost:5173` for now. Confirm with the user that this is done before continuing.

- [ ] **Step 2: Write the failing auth context test**

```tsx
// src/context/AuthContext.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
}));

function TestConsumer() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? `signed in as ${user.email}` : 'signed out'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any);
  });

  it('shows signed out state when there is no session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument());
  });

  it('shows signed in state when a session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { email: 'a@example.com' } } },
      error: null,
    } as any);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByText('signed in as a@example.com')).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/context/AuthContext.test.tsx`
Expected: FAIL, `AuthContext.tsx` does not exist yet.

- [ ] **Step 4: Write the auth context**

```tsx
// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, loading, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/context/AuthContext.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write `ProtectedRoute`**

```tsx
// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 7: Write `LoginPage` and `HomePage`**

```tsx
// src/pages/LoginPage.tsx
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold">Espresso Shot Tracker</h1>
      <button
        onClick={() => signInWithGoogle()}
        className="bg-black text-white rounded px-4 py-2"
      >
        Sign in with Google
      </button>
    </div>
  );
}
```

```tsx
// src/pages/HomePage.tsx
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { user, signOut } = useAuth();
  return (
    <div className="p-4">
      <p>Signed in as {user?.email}</p>
      <button onClick={() => signOut()} className="border rounded px-3 py-1 mt-2">
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Wire routing into `App.tsx` and update the smoke test**

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

```tsx
// src/App.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import { supabase } from './lib/supabaseClient';

vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
}));

describe('App', () => {
  it('redirects a signed out user to the login page', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/sign in with google/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 9: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 10: Manual verification of the real OAuth flow**

Run `npm run dev`, open the app, click "Sign in with Google," complete the real Google consent screen, and confirm you land on the home page showing your email with a working sign out button. This step cannot be automated because it requires an interactive browser consent flow with a real Google account - the automated tests above cover the app's own auth state logic, not the OAuth handshake itself.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add Google OAuth, auth context, and protected routing"
```

---

### Task 5: Shots data access layer

**Files:**
- Create: `src/lib/shots.ts`, `src/lib/shots.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabaseClient.ts` (Task 2), `shots` table from Task 3.
- Produces: `Shot`, `NewShotInput`, `UpdateShotInput` types, and `createShot(input: NewShotInput): Promise<Shot>`, `listShots(): Promise<Shot[]>`, `getShot(id: string): Promise<Shot | null>`, `updateShot(id: string, input: UpdateShotInput): Promise<Shot>`, `deleteShot(id: string): Promise<void>`, all exported from `src/lib/shots.ts`. Every later task that reads or writes shots uses these functions, never the Supabase client directly.

- [ ] **Step 1: Write the failing integration test**

```typescript
// src/lib/shots.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { createShot, listShots, getShot, updateShot, deleteShot } from './shots';

const LOCAL_URL = 'http://127.0.0.1:54321';
const TEST_EMAIL = `shots-crud-${Date.now()}@test.local`;
const TEST_PASSWORD = 'test-password-123';

beforeAll(async () => {
  const admin = createClient(LOCAL_URL, process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!);
  await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw error;
});

afterAll(async () => {
  await supabase.auth.signOut();
});

describe('shots data access', () => {
  it('creates and fetches a shot', async () => {
    const created = await createShot({
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
    });
    expect(created.id).toBeTruthy();
    expect(created.dose_g).toBe(18);

    const fetched = await getShot(created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('lists shots newest first', async () => {
    const first = await createShot({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 });
    const second = await createShot({ grind_setting: '19', dose_g: 18, yield_g: 36, pull_time_s: 30 });

    const shots = await listShots();
    const firstIndex = shots.findIndex((s) => s.id === first.id);
    const secondIndex = shots.findIndex((s) => s.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);
  });

  it('updates a shot', async () => {
    const created = await createShot({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 });
    const updated = await updateShot(created.id, { grind_setting: '20' });
    expect(updated.grind_setting).toBe('20');
  });

  it('deletes a shot', async () => {
    const created = await createShot({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 });
    await deleteShot(created.id);
    const fetched = await getShot(created.id);
    expect(fetched).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/shots.test.ts`
Expected: FAIL, `shots.ts` does not exist yet.

- [ ] **Step 3: Write `src/lib/shots.ts`**

```typescript
// src/lib/shots.ts
import { supabase } from './supabaseClient';

export type Shot = {
  id: string;
  user_id: string;
  grind_setting: string;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
  bean_name: string | null;
  roast_date: string | null;
  rating: number | null;
  tasting_note: string | null;
  created_at: string;
  updated_at: string;
};

export type NewShotInput = {
  grind_setting: string;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
  bean_name?: string | null;
  roast_date?: string | null;
  rating?: number | null;
  tasting_note?: string | null;
};

export type UpdateShotInput = Partial<NewShotInput>;

export async function createShot(input: NewShotInput): Promise<Shot> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('shots')
    .insert({ ...input, user_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listShots(): Promise<Shot[]> {
  const { data, error } = await supabase
    .from('shots')
    .select()
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getShot(id: string): Promise<Shot | null> {
  const { data, error } = await supabase.from('shots').select().eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateShot(id: string, input: UpdateShotInput): Promise<Shot> {
  const { data, error } = await supabase
    .from('shots')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShot(id: string): Promise<void> {
  const { error } = await supabase.from('shots').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/shots.test.ts`
Expected: PASS, all four tests. Requires the local Supabase stack running (`npx supabase start`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add shots data access layer with CRUD integration tests"
```

---

### Task 6: Shared shot form and New Shot page

**Files:**
- Create: `src/components/ShotForm.tsx`, `src/components/ShotForm.test.tsx`
- Create: `src/pages/NewShotPage.tsx`, `src/pages/NewShotPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `createShot` from `src/lib/shots.ts` (Task 5).
- Produces: `ShotForm` component and `ShotFormValues` type, `emptyShotFormValues` constant, all exported from `src/components/ShotForm.tsx`. Task 9's `EditShotPage` reuses `ShotForm` directly - do not duplicate the form fields there.

- [ ] **Step 1: Write the failing `ShotForm` test**

```tsx
// src/components/ShotForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShotForm, emptyShotFormValues } from './ShotForm';

describe('ShotForm', () => {
  it('submits with only the required fields filled in', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        ...emptyShotFormValues,
        grind_setting: '18',
        dose_g: '18',
        yield_g: '36',
        pull_time_s: '28',
      })
    );
  });

  it('includes optional fields when filled in', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText(/bean/i), { target: { value: 'Colombia Huila' } });
    fireEvent.change(screen.getByLabelText(/rating/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ bean_name: 'Colombia Huila', rating: '4' })
      )
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ShotForm.test.tsx`
Expected: FAIL, `ShotForm.tsx` does not exist yet.

- [ ] **Step 3: Write `ShotForm.tsx`**

```tsx
// src/components/ShotForm.tsx
import { useState, type FormEvent } from 'react';

export type ShotFormValues = {
  grind_setting: string;
  dose_g: string;
  yield_g: string;
  pull_time_s: string;
  bean_name: string;
  roast_date: string;
  rating: string;
  tasting_note: string;
};

export const emptyShotFormValues: ShotFormValues = {
  grind_setting: '',
  dose_g: '',
  yield_g: '',
  pull_time_s: '',
  bean_name: '',
  roast_date: '',
  rating: '',
  tasting_note: '',
};

type Props = {
  initialValues: ShotFormValues;
  submitLabel: string;
  onSubmit: (values: ShotFormValues) => Promise<void>;
};

export function ShotForm({ initialValues, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ShotFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shot');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        Grind setting
        <input
          className="border rounded px-2 py-1"
          value={values.grind_setting}
          onChange={(e) => set('grind_setting', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Dose (g)
        <input
          type="number"
          step="0.1"
          className="border rounded px-2 py-1"
          value={values.dose_g}
          onChange={(e) => set('dose_g', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Yield (g)
        <input
          type="number"
          step="0.1"
          className="border rounded px-2 py-1"
          value={values.yield_g}
          onChange={(e) => set('yield_g', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Pull time (s)
        <input
          type="number"
          step="1"
          className="border rounded px-2 py-1"
          value={values.pull_time_s}
          onChange={(e) => set('pull_time_s', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Bean / origin (optional)
        <input
          className="border rounded px-2 py-1"
          value={values.bean_name}
          onChange={(e) => set('bean_name', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Roast date (optional)
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={values.roast_date}
          onChange={(e) => set('roast_date', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Rating (optional, 1-5)
        <input
          type="number"
          min="1"
          max="5"
          step="1"
          className="border rounded px-2 py-1"
          value={values.rating}
          onChange={(e) => set('rating', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Tasting note (optional)
        <textarea
          className="border rounded px-2 py-1"
          value={values.tasting_note}
          onChange={(e) => set('tasting_note', e.target.value)}
        />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="bg-black text-white rounded px-4 py-2">
        {saving ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ShotForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing `NewShotPage` test**

```tsx
// src/pages/NewShotPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewShotPage } from './NewShotPage';
import { createShot } from '../lib/shots';

vi.mock('../lib/shots', () => ({
  createShot: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('NewShotPage', () => {
  it('creates a shot and navigates to its detail page', async () => {
    vi.mocked(createShot).mockResolvedValue({
      id: 'shot-1',
      user_id: 'user-1',
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
      bean_name: null,
      roast_date: null,
      rating: null,
      tasting_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith(
        expect.objectContaining({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28 })
      )
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: FAIL, `NewShotPage.tsx` does not exist yet.

- [ ] **Step 7: Write `NewShotPage.tsx`**

```tsx
// src/pages/NewShotPage.tsx
import { useNavigate } from 'react-router-dom';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from '../components/ShotForm';
import { createShot } from '../lib/shots';

export function NewShotPage() {
  const navigate = useNavigate();

  async function handleSubmit(values: ShotFormValues) {
    const shot = await createShot({
      grind_setting: values.grind_setting,
      dose_g: Number(values.dose_g),
      yield_g: Number(values.yield_g),
      pull_time_s: Number(values.pull_time_s),
      bean_name: values.bean_name || null,
      roast_date: values.roast_date || null,
      rating: values.rating ? Number(values.rating) : null,
      tasting_note: values.tasting_note || null,
    });
    navigate(`/shots/${shot.id}`);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-center mt-4">Log a shot</h1>
      <ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={handleSubmit} />
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Add the route in `App.tsx`**

```tsx
// src/App.tsx - add these two imports and one route
import { NewShotPage } from './pages/NewShotPage';
// ...
<Route
  path="/shots/new"
  element={
    <ProtectedRoute>
      <NewShotPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add shared shot form and New Shot page"
```

---

### Task 7: Shot list page

**Files:**
- Create: `src/pages/ShotListPage.tsx`, `src/pages/ShotListPage.test.tsx`
- Modify: `src/App.tsx` (replace `HomePage` with `ShotListPage` on `/`)
- Delete: `src/pages/HomePage.tsx` (its content is folded into `ShotListPage`)

**Interfaces:**
- Consumes: `listShots` from `src/lib/shots.ts` (Task 5), `useAuth` from `src/context/AuthContext.tsx` (Task 4).

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ShotListPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ShotListPage } from './ShotListPage';
import { listShots } from '../lib/shots';
import { useAuth } from '../context/AuthContext';

vi.mock('../lib/shots', () => ({ listShots: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

describe('ShotListPage', () => {
  it('renders each shot in the list', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@example.com' } as any,
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(listShots).mockResolvedValue([
      {
        id: 'shot-1',
        user_id: 'user-1',
        grind_setting: '18',
        dose_g: 18,
        yield_g: 36,
        pull_time_s: 28,
        bean_name: null,
        roast_date: null,
        rating: null,
        tasting_note: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/18g in \/ 36g out/i)).toBeInTheDocument());
  });

  it('shows an empty state when there are no shots', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'a@example.com' } as any,
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(listShots).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/no shots logged yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: FAIL, `ShotListPage.tsx` does not exist yet.

- [ ] **Step 3: Write `ShotListPage.tsx`**

```tsx
// src/pages/ShotListPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import { useAuth } from '../context/AuthContext';

export function ShotListPage() {
  const { user, signOut } = useAuth();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listShots()
      .then(setShots)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shots'));
  }, []);

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <span>{user?.email}</span>
        <button onClick={() => signOut()} className="border rounded px-3 py-1">
          Sign out
        </button>
      </div>
      <Link to="/shots/new" className="bg-black text-white rounded px-4 py-2 text-center">
        Log a shot
      </Link>
      {error && <p className="text-red-600">{error}</p>}
      {!shots && !error && <p>Loading...</p>}
      {shots?.length === 0 && <p>No shots logged yet.</p>}
      {shots && shots.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shots.map((shot) => (
            <li key={shot.id}>
              <Link to={`/shots/${shot.id}`} className="block border rounded px-3 py-2">
                {shot.grind_setting} - {shot.dose_g}g in / {shot.yield_g}g out - {shot.pull_time_s}s
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Replace `HomePage` with `ShotListPage` in `App.tsx`, delete `HomePage.tsx` and its test if any**

```tsx
// src/App.tsx - replace the HomePage import and the "/" route
import { ShotListPage } from './pages/ShotListPage';
// ...
<Route
  path="/"
  element={
    <ProtectedRoute>
      <ShotListPage />
    </ProtectedRoute>
  }
/>
```

```bash
rm src/pages/HomePage.tsx
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add shot list page, replacing the home placeholder"
```

---

### Task 8: Shot detail page

**Files:**
- Create: `src/pages/ShotDetailPage.tsx`, `src/pages/ShotDetailPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getShot` from `src/lib/shots.ts` (Task 5).
- Produces: `ShotDetailPage`, modified again in Task 9 (edit/delete) and Task 11 (video playback).

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ShotDetailPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShotDetailPage } from './ShotDetailPage';
import { getShot } from '../lib/shots';

vi.mock('../lib/shots', () => ({ getShot: vi.fn() }));

function renderAtShot(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/shots/${id}`]}>
      <Routes>
        <Route path="/shots/:id" element={<ShotDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ShotDetailPage', () => {
  it('renders the shot fields', async () => {
    vi.mocked(getShot).mockResolvedValue({
      id: 'shot-1',
      user_id: 'user-1',
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
      bean_name: 'Colombia Huila',
      roast_date: null,
      rating: 4,
      tasting_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Colombia Huila')).toBeInTheDocument());
    expect(screen.getByText('18 g')).toBeInTheDocument();
    expect(screen.getByText('36 g')).toBeInTheDocument();
  });

  it('shows a not-found message when the shot does not exist', async () => {
    vi.mocked(getShot).mockResolvedValue(null);

    renderAtShot('missing');

    await waitFor(() => expect(screen.getByText(/shot not found/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: FAIL, `ShotDetailPage.tsx` does not exist yet.

- [ ] **Step 3: Write `ShotDetailPage.tsx`**

```tsx
// src/pages/ShotDetailPage.tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getShot, type Shot } from '../lib/shots';

export function ShotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then(setShot)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-2">
      <Link to="/">Back to shots</Link>
      <h1 className="text-xl font-semibold">{shot.grind_setting}</h1>
      <dl className="grid grid-cols-2 gap-1">
        <dt>Dose</dt>
        <dd>{shot.dose_g} g</dd>
        <dt>Yield</dt>
        <dd>{shot.yield_g} g</dd>
        <dt>Pull time</dt>
        <dd>{shot.pull_time_s} s</dd>
        {shot.bean_name && (
          <>
            <dt>Bean</dt>
            <dd>{shot.bean_name}</dd>
          </>
        )}
        {shot.roast_date && (
          <>
            <dt>Roast date</dt>
            <dd>{shot.roast_date}</dd>
          </>
        )}
        {shot.rating != null && (
          <>
            <dt>Rating</dt>
            <dd>{shot.rating}</dd>
          </>
        )}
        {shot.tasting_note && (
          <>
            <dt>Notes</dt>
            <dd>{shot.tasting_note}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the route in `App.tsx`**

```tsx
// src/App.tsx - add this import and route
import { ShotDetailPage } from './pages/ShotDetailPage';
// ...
<Route
  path="/shots/:id"
  element={
    <ProtectedRoute>
      <ShotDetailPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add shot detail page"
```

---

### Task 9: Edit and delete shot

**Files:**
- Create: `src/pages/EditShotPage.tsx`, `src/pages/EditShotPage.test.tsx`
- Modify: `src/pages/ShotDetailPage.tsx`, `src/pages/ShotDetailPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ShotForm` from `src/components/ShotForm.tsx` (Task 6), `updateShot` and `deleteShot` from `src/lib/shots.ts` (Task 5).

- [ ] **Step 1: Write the failing `EditShotPage` test**

```tsx
// src/pages/EditShotPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditShotPage } from './EditShotPage';
import { getShot, updateShot } from '../lib/shots';

vi.mock('../lib/shots', () => ({ getShot: vi.fn(), updateShot: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('EditShotPage', () => {
  it('pre-fills the form and saves changes', async () => {
    vi.mocked(getShot).mockResolvedValue({
      id: 'shot-1',
      user_id: 'user-1',
      grind_setting: '18',
      dose_g: 18,
      yield_g: 36,
      pull_time_s: 28,
      bean_name: null,
      roast_date: null,
      rating: null,
      tasting_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    vi.mocked(updateShot).mockResolvedValue({} as any);

    render(
      <MemoryRouter initialEntries={['/shots/shot-1/edit']}>
        <Routes>
          <Route path="/shots/:id/edit" element={<EditShotPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText(/grind setting/i)).toHaveValue('18'));

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateShot).toHaveBeenCalledWith(
        'shot-1',
        expect.objectContaining({ grind_setting: '20' })
      )
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/EditShotPage.test.tsx`
Expected: FAIL, `EditShotPage.tsx` does not exist yet.

- [ ] **Step 3: Write `EditShotPage.tsx`**

```tsx
// src/pages/EditShotPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShotForm, type ShotFormValues } from '../components/ShotForm';
import { getShot, updateShot, type Shot } from '../lib/shots';

function toFormValues(shot: Shot): ShotFormValues {
  return {
    grind_setting: shot.grind_setting,
    dose_g: String(shot.dose_g),
    yield_g: String(shot.yield_g),
    pull_time_s: String(shot.pull_time_s),
    bean_name: shot.bean_name ?? '',
    roast_date: shot.roast_date ?? '',
    rating: shot.rating != null ? String(shot.rating) : '',
    tasting_note: shot.tasting_note ?? '',
  };
}

export function EditShotPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    getShot(id).then(setShot);
  }, [id]);

  async function handleSubmit(values: ShotFormValues) {
    if (!id) return;
    await updateShot(id, {
      grind_setting: values.grind_setting,
      dose_g: Number(values.dose_g),
      yield_g: Number(values.yield_g),
      pull_time_s: Number(values.pull_time_s),
      bean_name: values.bean_name || null,
      roast_date: values.roast_date || null,
      rating: values.rating ? Number(values.rating) : null,
      tasting_note: values.tasting_note || null,
    });
    navigate(`/shots/${id}`);
  }

  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-center mt-4">Edit shot</h1>
      <ShotForm initialValues={toFormValues(shot)} submitLabel="Save changes" onSubmit={handleSubmit} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/EditShotPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing delete test, added to `ShotDetailPage.test.tsx`**

```tsx
// add to src/pages/ShotDetailPage.test.tsx
import { fireEvent, waitFor } from '@testing-library/react';
import { deleteShot } from '../lib/shots';

// change the mock at the top of the file to:
vi.mock('../lib/shots', () => ({ getShot: vi.fn(), deleteShot: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// add this test inside the existing describe block
it('deletes the shot after confirmation and navigates to the list', async () => {
  vi.mocked(getShot).mockResolvedValue({
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18',
    dose_g: 18,
    yield_g: 36,
    pull_time_s: 28,
    bean_name: null,
    roast_date: null,
    rating: null,
    tasting_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  vi.mocked(deleteShot).mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  renderAtShot('shot-1');

  await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /delete/i }));

  await waitFor(() => expect(deleteShot).toHaveBeenCalledWith('shot-1'));
  expect(navigateMock).toHaveBeenCalledWith('/');
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: FAIL, no delete button exists yet.

- [ ] **Step 7: Add edit and delete controls to `ShotDetailPage.tsx`**

```tsx
// src/pages/ShotDetailPage.tsx - full updated file
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getShot, deleteShot, type Shot } from '../lib/shots';

export function ShotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then(setShot)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Delete this shot? This cannot be undone.')) return;
    await deleteShot(id);
    navigate('/');
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-2">
      <Link to="/">Back to shots</Link>
      <h1 className="text-xl font-semibold">{shot.grind_setting}</h1>
      <dl className="grid grid-cols-2 gap-1">
        <dt>Dose</dt>
        <dd>{shot.dose_g} g</dd>
        <dt>Yield</dt>
        <dd>{shot.yield_g} g</dd>
        <dt>Pull time</dt>
        <dd>{shot.pull_time_s} s</dd>
        {shot.bean_name && (
          <>
            <dt>Bean</dt>
            <dd>{shot.bean_name}</dd>
          </>
        )}
        {shot.roast_date && (
          <>
            <dt>Roast date</dt>
            <dd>{shot.roast_date}</dd>
          </>
        )}
        {shot.rating != null && (
          <>
            <dt>Rating</dt>
            <dd>{shot.rating}</dd>
          </>
        )}
        {shot.tasting_note && (
          <>
            <dt>Notes</dt>
            <dd>{shot.tasting_note}</dd>
          </>
        )}
      </dl>
      <div className="flex gap-2 mt-2">
        <Link to={`/shots/${id}/edit`} className="border rounded px-3 py-1">
          Edit
        </Link>
        <button onClick={handleDelete} className="text-red-600 border rounded px-3 py-1">
          Delete
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Add the edit route in `App.tsx`**

```tsx
// src/App.tsx - add this import and route
import { EditShotPage } from './pages/EditShotPage';
// ...
<Route
  path="/shots/:id/edit"
  element={
    <ProtectedRoute>
      <EditShotPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add edit and delete for shots"
```

---

### Task 10: Video upload on the New Shot form

**Files:**
- Create: `src/lib/videos.ts`, `src/lib/videos.test.ts`
- Modify: `src/pages/NewShotPage.tsx`, `src/pages/NewShotPage.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabaseClient.ts` (Task 2), `videos` table and `pour-videos` bucket from Task 3.
- Produces: `Video` type, `MAX_VIDEO_BYTES`, `MAX_VIDEO_DURATION_S`, `VIDEO_BUCKET` constants, `validateVideoSize(file)`, `getVideoDuration(file)`, `validateVideoFile(file)`, `uploadShotVideo(shotId, file)`, `getVideoForShot(shotId)`, `getVideoPlaybackUrl(video)`, all exported from `src/lib/videos.ts`. Task 11 consumes `getVideoForShot` and `getVideoPlaybackUrl`.

- [ ] **Step 1: Write the failing size validation test**

```typescript
// src/lib/videos.test.ts
import { describe, it, expect } from 'vitest';
import { validateVideoSize, MAX_VIDEO_BYTES } from './videos';

function makeFile(sizeBytes: number, name = 'pour.mp4', type = 'video/mp4'): File {
  const blob = new Blob([new Uint8Array(sizeBytes)]);
  return new File([blob], name, { type });
}

describe('validateVideoSize', () => {
  it('accepts a file under the size cap', () => {
    const result = validateVideoSize(makeFile(1024));
    expect(result.valid).toBe(true);
  });

  it('rejects a file over the size cap', () => {
    const result = validateVideoSize(makeFile(MAX_VIDEO_BYTES + 1));
    expect(result.valid).toBe(false);
  });
});
```

Note: `getVideoDuration` reads real video metadata via the browser's `<video>` element, which jsdom cannot decode from a fake file. It is verified manually in Step 6, not by an automated test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/videos.test.ts`
Expected: FAIL, `videos.ts` does not exist yet.

- [ ] **Step 3: Write `src/lib/videos.ts`**

```typescript
// src/lib/videos.ts
import { supabase } from './supabaseClient';

export type Video = {
  id: string;
  shot_id: string;
  user_id: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_DURATION_S = 180;
export const VIDEO_BUCKET = 'pour-videos';

export function validateVideoSize(file: File): { valid: true } | { valid: false; reason: string } {
  if (file.size > MAX_VIDEO_BYTES) {
    return { valid: false, reason: 'Video is larger than 500MB' };
  }
  return { valid: true };
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error('Could not read video metadata'));
    video.src = URL.createObjectURL(file);
  });
}

export async function validateVideoFile(
  file: File
): Promise<{ valid: true } | { valid: false; reason: string }> {
  const sizeCheck = validateVideoSize(file);
  if (!sizeCheck.valid) return sizeCheck;

  const duration = await getVideoDuration(file);
  if (duration > MAX_VIDEO_DURATION_S) {
    return { valid: false, reason: 'Video is longer than 3 minutes' };
  }
  return { valid: true };
}

export async function uploadShotVideo(shotId: string, file: File): Promise<Video> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'mp4';
  const storageKey = `${userData.user.id}/${shotId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(storageKey, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('videos')
    .insert({
      shot_id: shotId,
      user_id: userData.user.id,
      storage_key: storageKey,
      content_type: file.type,
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getVideoForShot(shotId: string): Promise<Video | null> {
  const { data, error } = await supabase.from('videos').select().eq('shot_id', shotId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getVideoPlaybackUrl(video: Video): Promise<string> {
  const { data, error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(video.storage_key, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/videos.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the file input to `NewShotPage.tsx`**

```tsx
// src/pages/NewShotPage.tsx - full updated file
import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from '../components/ShotForm';
import { createShot } from '../lib/shots';
import { validateVideoFile, uploadShotVideo } from '../lib/videos';

export function NewShotPage() {
  const navigate = useNavigate();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  async function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setVideoError(null);
    setVideoFile(null);
    if (!file) return;

    const result = await validateVideoFile(file);
    if (!result.valid) {
      setVideoError(result.reason);
      return;
    }
    setVideoFile(file);
  }

  async function handleSubmit(values: ShotFormValues) {
    const shot = await createShot({
      grind_setting: values.grind_setting,
      dose_g: Number(values.dose_g),
      yield_g: Number(values.yield_g),
      pull_time_s: Number(values.pull_time_s),
      bean_name: values.bean_name || null,
      roast_date: values.roast_date || null,
      rating: values.rating ? Number(values.rating) : null,
      tasting_note: values.tasting_note || null,
    });
    if (videoFile) {
      await uploadShotVideo(shot.id, videoFile);
    }
    navigate(`/shots/${shot.id}`);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-center mt-4">Log a shot</h1>
      <div className="max-w-md mx-auto px-4 flex flex-col gap-1">
        <label htmlFor="video-input">Pour video (optional)</label>
        <input id="video-input" type="file" accept="video/*" onChange={handleVideoChange} />
        {videoError && <p className="text-red-600">{videoError}</p>}
      </div>
      <ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={handleSubmit} />
    </div>
  );
}
```

- [ ] **Step 6: Manual verification of video upload**

Run `npm run dev`, sign in, log a shot, attach a short video file under the size cap, save, and confirm no error appears and the shot detail page loads. This is a manual step because `validateVideoFile`'s duration check needs real browser video decoding that jsdom cannot perform in an automated test.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add optional video upload to the New Shot form"
```

---

### Task 11: Video playback on the shot detail page

**Files:**
- Modify: `src/pages/ShotDetailPage.tsx`, `src/pages/ShotDetailPage.test.tsx`

**Interfaces:**
- Consumes: `getVideoForShot` and `getVideoPlaybackUrl` from `src/lib/videos.ts` (Task 10).

- [ ] **Step 1: Write the failing test, added to `ShotDetailPage.test.tsx`**

```tsx
// add to src/pages/ShotDetailPage.test.tsx
import { getVideoForShot, getVideoPlaybackUrl } from '../lib/videos';

// change the mock at the top of the file to:
vi.mock('../lib/shots', () => ({ getShot: vi.fn(), deleteShot: vi.fn() }));
vi.mock('../lib/videos', () => ({ getVideoForShot: vi.fn(), getVideoPlaybackUrl: vi.fn() }));

// add this test inside the existing describe block
it('renders a video player when a video is attached', async () => {
  vi.mocked(getShot).mockResolvedValue({
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18',
    dose_g: 18,
    yield_g: 36,
    pull_time_s: 28,
    bean_name: null,
    roast_date: null,
    rating: null,
    tasting_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  vi.mocked(getVideoForShot).mockResolvedValue({
    id: 'video-1',
    shot_id: 'shot-1',
    user_id: 'user-1',
    storage_key: 'user-1/shot-1/abc.mp4',
    content_type: 'video/mp4',
    size_bytes: 1000,
    uploaded_at: '2026-01-01T00:00:00Z',
  });
  vi.mocked(getVideoPlaybackUrl).mockResolvedValue('https://example.test/signed-url');

  renderAtShot('shot-1');

  await waitFor(() => {
    const player = screen.getByTestId('pour-video');
    expect(player).toHaveAttribute('src', 'https://example.test/signed-url');
  });
});

it('renders no video player when no video is attached', async () => {
  vi.mocked(getShot).mockResolvedValue({
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18',
    dose_g: 18,
    yield_g: 36,
    pull_time_s: 28,
    bean_name: null,
    roast_date: null,
    rating: null,
    tasting_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  vi.mocked(getVideoForShot).mockResolvedValue(null);

  renderAtShot('shot-1');

  await waitFor(() => expect(screen.getByText('18 g')).toBeInTheDocument());
  expect(screen.queryByTestId('pour-video')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: FAIL, no video player exists yet.

- [ ] **Step 3: Add video playback to `ShotDetailPage.tsx`**

```tsx
// src/pages/ShotDetailPage.tsx - full updated file
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getShot, deleteShot, type Shot } from '../lib/shots';
import { getVideoForShot, getVideoPlaybackUrl } from '../lib/videos';

export function ShotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then(setShot)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getVideoForShot(id).then((video) => {
      if (!video) return;
      getVideoPlaybackUrl(video).then(setVideoUrl);
    });
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Delete this shot? This cannot be undone.')) return;
    await deleteShot(id);
    navigate('/');
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-2">
      <Link to="/">Back to shots</Link>
      <h1 className="text-xl font-semibold">{shot.grind_setting}</h1>
      {videoUrl && (
        <video data-testid="pour-video" src={videoUrl} controls className="w-full rounded" />
      )}
      <dl className="grid grid-cols-2 gap-1">
        <dt>Dose</dt>
        <dd>{shot.dose_g} g</dd>
        <dt>Yield</dt>
        <dd>{shot.yield_g} g</dd>
        <dt>Pull time</dt>
        <dd>{shot.pull_time_s} s</dd>
        {shot.bean_name && (
          <>
            <dt>Bean</dt>
            <dd>{shot.bean_name}</dd>
          </>
        )}
        {shot.roast_date && (
          <>
            <dt>Roast date</dt>
            <dd>{shot.roast_date}</dd>
          </>
        )}
        {shot.rating != null && (
          <>
            <dt>Rating</dt>
            <dd>{shot.rating}</dd>
          </>
        )}
        {shot.tasting_note && (
          <>
            <dt>Notes</dt>
            <dd>{shot.tasting_note}</dd>
          </>
        )}
      </dl>
      <div className="flex gap-2 mt-2">
        <Link to={`/shots/${id}/edit`} className="border rounded px-3 py-1">
          Edit
        </Link>
        <button onClick={handleDelete} className="text-red-600 border rounded px-3 py-1">
          Delete
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual verification of real playback**

Run `npm run dev`, open a shot that has a video attached (from Task 10's manual verification), and confirm it actually plays in the browser. This double-checks the known HEVC/.mov browser-compatibility limitation from `docs/mvp-design.md` section 2 - if playback fails, it is a known limitation, not a bug to fix in v1.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add video playback to the shot detail page"
```

---

### Task 12: Deploy to Vercel and verify against the done checklist

This task has manual steps. If you are an agent executing this plan, stop at each manual step, tell the user exactly what to do, and wait for confirmation before continuing.

**Files:**
- Create: `vercel.json` (SPA rewrite so client-side routes resolve on refresh)

- [ ] **Step 1: Add the SPA rewrite config**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Commit it**

```bash
git add -A
git commit -m "chore: add Vercel SPA rewrite config"
```

- [ ] **Step 3: Manual: connect the repository to Vercel**

Tell the user: push this repository to GitHub if it is not already there, then in the Vercel dashboard import the repository as a new project. Vercel will detect the Vite framework automatically. Before the first deploy, add two environment variables in the project settings: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, using the cloud project values from Task 2 Step 1 (not the local ones). Deploy.

- [ ] **Step 4: Manual: update the Supabase redirect configuration for the production URL**

Tell the user: once Vercel gives you the production URL, go back to the Supabase dashboard, Authentication > URL Configuration, and set the Site URL to that production URL (replacing the `localhost:5173` value from Task 4). Add the production URL to the redirect allow list as well.

- [ ] **Step 5: Manual: verify against the v1 done checklist from `docs/mvp-design.md` section 1**

Tell the user to open the production URL and walk through each item, confirming each one works:

1. Sign up / log in with Google and land in your own account.
2. Log a shot with only the four required fields filled in, confirm it saves quickly.
3. Edit a shot you just logged, confirm the change is reflected.
4. Delete a shot, confirm it disappears from the list.
5. Open the shot list, confirm your shots appear newest first.
6. Open a single shot, confirm every field you entered is visible.
7. Sign out, sign back in (or open the app in a different browser/device), confirm the same shots are still there.
8. This last one needs two accounts: sign in as a second Google account and confirm you cannot see the first account's shots, including by copying a shot's URL from the first account into the second account's browser session.

This is the final verification of the v1 "done" definition. Anything that does not check out is a bug against this plan, not an acceptable v1 gap.

- [ ] **Step 6: Commit any fixes discovered during verification, then confirm the plan is complete**

Once all items in Step 5 pass, the v1 MVP defined in `docs/mvp-design.md` is done.

