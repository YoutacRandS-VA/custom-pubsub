import { createLibp2p } from 'libp2p'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { yamux } from '@chainsafe/libp2p-yamux'
import { noise } from '@chainsafe/libp2p-noise'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { createHelia } from 'helia'
import { ipns } from '@helia/ipns'
import { dht, pubsub } from '@helia/ipns/routing'
import { strings } from '@helia/strings'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'
import { kadDHT } from '@libp2p/kad-dht'
import { ipnsSelector } from 'ipns/selector'
import { ipnsValidator } from 'ipns/validator'

const logEvents = (nodeName, node) => {
    const events = [
        // 'connection:close',
        // 'connection:open',
        // 'connection:prune',
        // 'peer:connect',
        // 'peer:disconnect',
        // 'peer:discovery',
        // 'peer:identify',
        // 'peer:update',
        // 'self:peer:update',
        // 'start',
        // 'stop',
        // 'transport:close',
        // 'transport:listening',
    ]
    const logEvent = (event) => console.log(nodeName, event.type, event.detail)
    events.forEach(event => node.addEventListener(event, logEvent))
    node.services.pubsub.addEventListener('message', (evt) => {
        console.log('')
        console.log(`${nodeName} received pubsub message:`)
        console.log(`  topic: ${evt.detail.topic}`)
        console.log(`  from: ${evt.detail.from}`)
        console.log(`  message: ${uint8ArrayToString(evt.detail.data).replaceAll(/[^a-zA-Z0-9/\-:.!@]/g, '@')}`) // don't print binary
        console.log('')
    })
}

const createNode1 = async () => {
    const libp2p = await createLibp2p({
        addresses: {
            listen: ['/ip4/127.0.0.1/tcp/0']
        },
        transports: [tcp()],
        streamMuxers: [yamux(), mplex()],
        connectionEncryption: [noise()],
        services: {
            identify: identify(),
            // dht: kadDHT({
            //     validators: {ipns: ipnsValidator},
            //     selectors: {ipns: ipnsSelector}
            // }),
            pubsub: gossipsub({allowPublishToZeroPeers: false})
        }
    })
    logEvents('node1', libp2p)

    const helia = await createHelia({
        libp2p
    })
    const name = ipns(helia, {
      routers: [
        // dht(helia),
        pubsub(helia)
      ]
    })
    return {helia, name}
}
const node1 = await createNode1()

const createNode2 = async () => {
    const libp2p = await createLibp2p({
        addresses: {
            listen: ['/ip4/127.0.0.1/tcp/0']
        },
        peerDiscovery: [bootstrap({list: node1.helia.libp2p.getMultiaddrs()})],
        transports: [tcp()],
        streamMuxers: [yamux(), mplex()],
        connectionEncryption: [noise()],
        services: {
            identify: identify(),
            // dht: kadDHT({
            //     validators: {ipns: ipnsValidator},
            //     selectors: {ipns: ipnsSelector}
            // }),
            pubsub: gossipsub({allowPublishToZeroPeers: false})
        }
    })
    logEvents('node2', libp2p)

    const helia = await createHelia({
        libp2p,
    })
    const name = ipns(helia, {
      routers: [
        // dht(helia),
        pubsub(helia)
      ]
    })
    return {helia, name}
}
const node2 = await createNode2()

console.log('node1', node1.helia.libp2p.getMultiaddrs(), 'node2', node2.helia.libp2p.getMultiaddrs(), '\n')

// wait node2 connects to node1
await new Promise(r => node1.helia.libp2p.addEventListener('connection:open', r))

// create a public key to publish as an ipns name
const peerId = await createEd25519PeerId()

// join the ipns over pubsub topics (throws because no records published yet)
try {
    await node1.name.resolve(peerId)
}
catch (e) {}
try {
    await node2.name.resolve(peerId)
}
catch (e) {}

// wait some time for peers to connect
await new Promise(r => setTimeout(r, 1000))

// create first ipns record
const s = strings(node1.helia)
let cid = await s.add('hello')
console.log('first ipns record', cid)

// publish the name
while (true) {
    try {
        console.log('publishing...')
        await node1.name.publish(peerId, cid)
        console.log('published')
        break
    }
    catch (e) {
        console.log('error:', e.message)
        await new Promise(r => setTimeout(r, 1000))
    }
}

// wait some time for publishing to propagate
await new Promise(r => setTimeout(r, 1000))

// resolve the name
while (true) {
    try {
        console.log('resolving...')
        const _cid = await node2.name.resolve(peerId)
        console.log('resolved', _cid)
        break
    }
    catch (e) {
        console.log('error:', e.message)
        await new Promise(r => setTimeout(r, 1000))
    }
}

// create second ipns record
cid = await s.add('goodbye')
console.log('second ipns record', cid)

// publish the name
while (true) {
    try {
        console.log('publishing...')
        await node1.name.publish(peerId, cid)
        console.log('published')
        break
    }
    catch (e) {
        console.log('error:', e.message)
        await new Promise(r => setTimeout(r, 1000))
    }
}

// wait some time for publishing to propagate
await new Promise(r => setTimeout(r, 1000))

// resolve the name
while (true) {
    try {
        console.log('resolving...')
        const _cid = await node2.name.resolve(peerId)
        console.log('resolved', _cid)
        if (String(cid) !== String(_cid)) {
            throw Error(`didn't find updated ipns record yet`)
        }
        break
    }
    catch (e) {
        console.log('error:', e.message)
        await new Promise(r => setTimeout(r, 1000))
    }
}
