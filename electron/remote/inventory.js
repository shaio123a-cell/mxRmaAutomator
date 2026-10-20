const { readJson, writeJsonAtomic, newId } = require('./util')

const HOST_FIELDS = ['id', 'name', 'address', 'os', 'transport', 'credentialProfileId', 'environment', 'linkedDeviceId', 'hostKeyFingerprint', 'insecureHttp', 'remoteWorkingDir', 'lastConnectedAt']
const PROFILE_FIELDS = ['id', 'name', 'authType', 'username', 'privateKeyPath']

function pick(source, fields) {
  const result = {}
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = source[field]
  }
  return result
}

class Inventory {
  constructor(hostsFile, profilesFile) {
    this.hostsFile = hostsFile
    this.profilesFile = profilesFile
    this.hosts = []
    this.profiles = []
    this.ready = null
  }

  async load() {
    if (!this.ready) {
      this.ready = (async () => {
        const hosts = await readJson(this.hostsFile, [])
        const profiles = await readJson(this.profilesFile, [])
        this.hosts = Array.isArray(hosts) ? hosts : []
        this.profiles = Array.isArray(profiles) ? profiles : []
      })()
    }
    await this.ready
    return this
  }

  async list() {
    await this.load()
    return { hosts: this.hosts.slice(), profiles: this.profiles.slice() }
  }

  async getHost(id) {
    await this.load()
    return this.hosts.find(host => host.id === id) || null
  }

  async saveHost(input) {
    await this.load()
    if (!input || typeof input !== 'object') throw new Error('Invalid host record.')
    const name = String(input.name || '').trim()
    const address = String(input.address || '').trim()
    if (!name) throw new Error('Host name is required.')
    if (!address) throw new Error('Host address is required.')
    const host = pick({ ...input, name, address }, HOST_FIELDS)
    host.id = input.id || newId('host')
    host.os = input.os === 'linux' ? 'linux' : 'windows'
    host.transport = ['ssh', 'winrm', 'powershell-remoting', 'local'].includes(input.transport) ? input.transport : 'ssh'
    host.credentialProfileId = String(input.credentialProfileId || '')
    const index = this.hosts.findIndex(item => item.id === host.id)
    if (index >= 0) this.hosts[index] = { ...this.hosts[index], ...host }
    else this.hosts.push(host)
    await writeJsonAtomic(this.hostsFile, this.hosts)
    return index >= 0 ? this.hosts[index] : host
  }

  async deleteHost(id) {
    await this.load()
    this.hosts = this.hosts.filter(host => host.id !== id)
    await writeJsonAtomic(this.hostsFile, this.hosts)
  }

  async saveProfile(input) {
    await this.load()
    if (!input || typeof input !== 'object') throw new Error('Invalid credential profile.')
    const name = String(input.name || '').trim()
    if (!name) throw new Error('Profile name is required.')
    const id = input.id || newId('cred')
    const profile = pick({ ...input, id, name }, PROFILE_FIELDS)
    profile.id = id
    profile.name = name
    profile.authType = ['password', 'private-key', 'ssh-agent', 'windows-integrated'].includes(input.authType) ? input.authType : 'password'
    profile.username = String(input.username || '')
    const index = this.profiles.findIndex(item => item.id === id)
    if (index >= 0) this.profiles[index] = { ...this.profiles[index], ...profile }
    else this.profiles.push(profile)
    await writeJsonAtomic(this.profilesFile, this.profiles)
    return index >= 0 ? this.profiles[index] : profile
  }

  async deleteProfile(id) {
    await this.load()
    this.profiles = this.profiles.filter(profile => profile.id !== id)
    await writeJsonAtomic(this.profilesFile, this.profiles)
  }

  async updateFingerprint(id, fingerprint) {
    await this.load()
    const host = this.hosts.find(item => item.id === id)
    if (!host) return
    host.hostKeyFingerprint = fingerprint
    await writeJsonAtomic(this.hostsFile, this.hosts)
  }

  async markConnected(id) {
    await this.load()
    const host = this.hosts.find(item => item.id === id)
    if (!host) return
    host.lastConnectedAt = new Date().toISOString()
    await writeJsonAtomic(this.hostsFile, this.hosts)
  }
}

module.exports = { Inventory }
