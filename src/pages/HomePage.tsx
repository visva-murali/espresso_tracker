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
