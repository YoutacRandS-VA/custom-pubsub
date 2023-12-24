import path from 'path'
import {spawn, spawnSync} from 'child_process'
import ps from 'node:process'
import {path as ipfsPath} from 'kubo'
const ipfsDataPath = './.ipfs'
const env = {IPFS_PATH: ipfsDataPath}

// use this custom function instead of spawnSync for better logging
// also spawnSync might have been causing crash on start on windows
const spawnAsync = (...args) =>
  new Promise((resolve, reject) => {
    const spawedProcess = spawn(...args)
    spawedProcess.on('exit', (exitCode, signal) => {
      if (exitCode === 0) resolve()
      else reject(Error(`spawnAsync process '${spawedProcess.pid}' exited with code '${exitCode}' signal '${signal}'`))
    })
    spawedProcess.stderr.on('data', (data) => console.error(data.toString()))
    spawedProcess.stdin.on('data', (data) => console.log(data.toString()))
    spawedProcess.stdout.on('data', (data) => console.log(data.toString()))
    spawedProcess.on('error', (data) => console.error(data.toString()))
  })

export const kuboSpawnSync = (...args) => {
  console.log('ipfs', ...args)
  return spawnSync(ipfsPath(), args, {env, hideWindows: true}).stdout.toString()
}

export const kuboSpawnAsync = (...args) => {
  console.log('ipfs', ...args)
  return spawnAsync(ipfsPath(), args, {env, hideWindows: true})
}

const startIpfs = async () => {
  // init ipfs client on first launch
  try {
    await spawnAsync(ipfsPath(), ['init'], {env, hideWindows: true})
  } catch (e) {}

  await new Promise((resolve, reject) => {
    const ipfsProcess = spawn(ipfsPath(), ['daemon', '--migrate', '--enable-namesys-pubsub'], {env, hideWindows: true})
    console.log(`ipfs daemon process started with pid ${ipfsProcess.pid}`)
    let lastError
    ipfsProcess.stderr.on('data', (data) => {
      lastError = data.toString()
      console.error(data.toString())
    })
    ipfsProcess.stdin.on('data', (data) => console.log(data.toString()))
    ipfsProcess.stdout.on('data', (data) => console.log(data.toString()))
    ipfsProcess.on('error', (data) => console.error(data.toString()))
    ipfsProcess.on('exit', () => {
      console.error(`ipfs process with pid ${ipfsProcess.pid} exited`)
      reject(Error(lastError))
    })
    process.on('exit', () => {
      try {
        ps.kill(ipfsProcess.pid)
      } catch (e) {
        console.log(e)
      }
      try {
        // sometimes ipfs doesnt exit unless we kill pid +1
        ps.kill(ipfsProcess.pid + 1)
      } catch (e) {
        console.log(e)
      }
    })

    ipfsProcess.stdout.on('data', (data) => {
      if (data.toString().match('Daemon is ready')) {
        resolve()
      }
    })
  })
}

export default startIpfs
