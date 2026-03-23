import { buildNetMetaPayload } from '../../net/metaPayload.js';

export function sendHubMeta(state) {
  const net = state?.net;
  const prog = state?.progression;
  if (!net || net.status !== 'connected' || net.isHost) return false;
  if (!prog) return false;
  try {
    const payload = buildNetMetaPayload(prog);
    if (!payload) return false;
    net.sendMeta(payload);
    return true;
  } catch {
    return false;
  }
}
