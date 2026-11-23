/** An email address that, when it must wrap, wraps after the "@" rather than mid-word. */
export function EmailText({ email }: { email: string }) {
  const at = email.indexOf('@')
  if (at < 0) return <>{email}</>
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  )
}
