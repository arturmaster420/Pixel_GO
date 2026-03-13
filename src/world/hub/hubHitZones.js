import { getHubSceneLayout } from './hubLayout.js';

export function getHubHitZones(arenaSpec) {
  const layout = getHubSceneLayout(arenaSpec);
  const smallR = layout.artSize * 0.108;
  const diagR = layout.artSize * 0.118;
  return [
    { id: 'portal', active: true, label: 'PORTAL', x: layout.nodes.portal.x, y: layout.nodes.portal.y, r: smallR * 0.88 },
    { id: 'merchant', active: true, label: 'MERCHANT', x: layout.nodes.merchant.x, y: layout.nodes.merchant.y, r: diagR },
    { id: 'tierMaster', active: true, label: 'TIER MASTER', x: layout.nodes.tierMaster.x, y: layout.nodes.tierMaster.y, r: diagR },
    { id: 'start', active: true, label: 'START', x: layout.nodes.start.x, y: layout.nodes.start.y, r: smallR * 0.98 },
    { id: 'left', active: false, label: '', x: layout.nodes.left.x, y: layout.nodes.left.y, r: smallR * 0.94 },
    { id: 'right', active: false, label: '', x: layout.nodes.right.x, y: layout.nodes.right.y, r: smallR * 0.94 },
    { id: 'leftBottom', active: false, label: '', x: layout.nodes.leftBottom.x, y: layout.nodes.leftBottom.y, r: diagR * 0.96 },
    { id: 'rightBottom', active: false, label: '', x: layout.nodes.rightBottom.x, y: layout.nodes.rightBottom.y, r: diagR * 0.96 },
  ];
}
