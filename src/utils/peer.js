import { list as abList } from '@/api/address_book'
import { list as myAbList } from '@/api/my/address_book'

// The Windows MSI built from our client fork registers its URL
// protocol under `${BRAND_APP_NAME.toLowerCase()}://` (upstream's
// get_uri_prefix() — libs/hbb_common/src/config.rs). `rustdesk://`
// is not bound on machines that installed a branded build, so the
// button fails with "scheme does not have a registered handler".
//
// Kept as a build-time env with a safe default so downstream forks
// can override it at `npm run build` without rebuilding our logic.
const URI_SCHEME =
  import.meta.env.VITE_URI_SCHEME || 'supportinternal'

// Accepts either the peer id string (legacy callers) or the full
// address-book row object. When a row is passed and carries a
// `password`, it is appended as a query parameter so the desktop
// client's URI parser (libs/hbb_common, flutter/common.dart) skips
// its own password prompt on open. When only the id is available
// (e.g. from /api/peers list views) a best-effort AB lookup fetches
// the password; if that 404s we fall back to the bare URI.
export const connectByClient = async (idOrRow) => {
  const id = typeof idOrRow === 'string' ? idOrRow : idOrRow?.id
  let password =
    typeof idOrRow === 'object' && idOrRow !== null ? idOrRow.password : null
  if (!id) return
  if (!password) {
    password = await _lookupPasswordInAddressBook(id)
  }
  const href = password
    ? `${URI_SCHEME}://${id}?password=${encodeURIComponent(password)}`
    : `${URI_SCHEME}://${id}`
  const a = document.createElement('a')
  a.href = href
  a.target = '_self'
  a.click()
}

async function _lookupPasswordInAddressBook (id) {
  for (const api of [abList, myAbList]) {
    try {
      const res = await api({ keyword: id, page_size: 10 })
      const peers = res?.data?.list || res?.list || []
      const hit = peers.find((p) => String(p.id) === String(id))
      if (hit?.password) return hit.password
    } catch (_e) {
      // ignore, try next endpoint
    }
  }
  return null
}
