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
