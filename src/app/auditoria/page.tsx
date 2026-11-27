import Auditoria from '@/components/auditoria';

export const metadata = { title: 'Auditoría de inventario' };

export default function Page() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl p-4 sm:p-6">
      <Auditoria />
    </main>
  );
}
