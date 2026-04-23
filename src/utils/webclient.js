import Websock from '@/utils/webclient/websock'
import * as rendezvous from '@/utils/webclient/rendezvous'
import * as message from '@/utils/webclient/message'
import { ElMessageBox } from 'element-plus'
import { T } from '@/utils/i18n'
import { useAppStore } from '@/store/app'
import { list as abList } from '@/api/address_book'
import { list as myAbList } from '@/api/my/address_book'



const app = useAppStore()

export const toWebClientLink = async (row) => {
  // Fork customisation: embed the peer's plaintext password into the
  // web client URL fragment (`?password=<pw>`) so the prompt is
  // skipped. The address-book view already includes `password` in
  // each row, but the Peers / Devices list does not — fall back to a
  // keyword-scoped address-book lookup so the auto-login works from
  // every button that calls toWebClientLink.
  const base = `${app.setting.rustdeskConfig.api_server}/webclient2/#/${row.id}`
  let pw = row.password
  if (!pw && row.id) {
    pw = await _lookupPasswordInAddressBook(row.id)
  }
  const url = pw ? `${base}?password=${encodeURIComponent(pw)}` : base
  window.open(url)
}

async function _lookupPasswordInAddressBook (id) {
  // Try admin AB first (superset), then personal AB. Either endpoint
  // 403s for non-privileged users — that's fine, we silently fall
  // through and the button still opens a prompt.
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

export async function getPeerSlat (id) {
  const [addr, port] = app.setting.rustdeskConfig.id_server.split(':')
  if (!addr) {
    return
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new Websock(`${scheme}://${addr}:21118`, true)
  await ws.open()
  const conn_type = rendezvous.ConnType.DEFAULT_CONN
  const nat_type = rendezvous.NatType.SYMMETRIC
  const punch_hole_request = rendezvous.PunchHoleRequest.fromPartial({
    id,
    licence_key: app.setting.rustdeskConfig.value.key || undefined,
    conn_type,
    nat_type,
    token: undefined,
  })
  ws.sendRendezvous({ punch_hole_request })
  //rendezvous.RendezvousMessage
  const msg = (await ws.next())
  ws.close()
  console.log(new Date() + ': Got relay response', msg)
  const phr = msg.punch_hole_response
  const rr = msg.relay_response
  if (phr) {
    if (phr?.other_failure) {
      this.msgbox('error', 'Error', phr?.other_failure)
      return
    }
    if (phr.failure != rendezvous.PunchHoleResponse_Failure.UNRECOGNIZED) {
      switch (phr?.failure) {
        case rendezvous.PunchHoleResponse_Failure.ID_NOT_EXIST:
          ElMessageBox.alert(T('IDNotExist'), T('Error'))
          break
        case rendezvous.PunchHoleResponse_Failure.OFFLINE:
          ElMessageBox.alert(T('RemoteDesktopOffline'), T('Error'))
          break
        case rendezvous.PunchHoleResponse_Failure.LICENSE_MISMATCH:
          ElMessageBox.alert(T('KeyMismatch'), T('Error'))
          break
        case rendezvous.PunchHoleResponse_Failure.LICENSE_OVERUSE:
          ElMessageBox.alert(T('KeyOveruse'), T('Error'))
          break
      }
    }
    return false
  } else if (rr) {
    const uuid = rr.uuid
    console.log(new Date() + ': Connecting to relay server')

    const _ws = new Websock(`${scheme}://${addr}:21119`, false)
    await _ws.open()
    console.log(new Date() + ': Connected to relay server')
    const request_relay = rendezvous.RequestRelay.fromPartial({
      licence_key: app.setting.rustdeskConfig.key || undefined,
      uuid,
    })
    _ws.sendRendezvous({ request_relay })

    //暂不支持pk
    const public_key = message.PublicKey.fromPartial({})
    _ws?.sendMessage({ public_key })
    // const secure = (await this.secure(pk)) || false;
    // globals.pushEvent("connection_ready", { secure, direct: false });
    while (true) {
      const msg = (await _ws?.next())
      console.log('msg', msg)
      if (msg?.hash) {
        console.log('hash msg.....', msg.hash)
        _ws.close()
        return msg.hash
      }
    }
    return false
  }

}

export function getV2ShareUrl (token) {
  return `${app.setting.rustdeskConfig.api_server}/webclient2/#/?share_token=${token}`
}
