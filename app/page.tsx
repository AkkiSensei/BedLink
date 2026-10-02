import { redirect } from 'next/navigation'

export default function Page() {
  // Root route: redirect to nurse page as the default authenticated entry point.
  // The middleware handles unauthenticated redirects back to here with ?unauthorized=1.
  redirect('/nurse')
}

