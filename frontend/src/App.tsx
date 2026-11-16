import { Toaster } from 'sonner';
import { useMe } from './api/hooks';
import { AppLayout } from './pages/AppLayout';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const me = useMe();

  let content: React.ReactNode;
  if (me.isLoading) {
    content = (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="size-8 animate-spin rounded-full border-2 border-neutral-300 border-t-accent-600" />
      </div>
    );
  } else if (me.isError) {
    content = (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p>Could not reach the server.</p>
        <button className="btn-primary" onClick={() => me.refetch()}>Retry</button>
      </div>
    );
  } else if (!me.data) {
    content = <LoginPage />;
  } else {
    content = <AppLayout user={me.data} />;
  }

  return (
    <>
      {content}
      <Toaster richColors closeButton position="bottom-right" theme="system" />
    </>
  );
}
