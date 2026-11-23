import { redirect } from 'next/navigation';

// Las organizaciones se administran ahora en el área "Mi plataforma".
export default function Page() {
  redirect('/plataforma');
}
