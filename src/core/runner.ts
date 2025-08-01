import { CommonConfigurationInputV1, CommonProvisionInputV1, CommonProvisionOutputV1 } from './state/state';
import { getLogger, Logger } from '../log/utils';
import { CLOUDYPAD_PROVIDER } from './const';
import { SunshineMoonlightPairer } from './moonlight/pairer/sunshine';
import { MoonlightPairer } from './moonlight/pairer/abstract';
import { WolfMoonlightPairer } from './moonlight/pairer/wolf';
import { SSHClient, SSHClientArgs, SshKeyLoader } from '../tools/ssh';

/**
 * Options that may be passed to InstanceRunner functions
 */
export interface InstanceRunnerOptions  {

}

export enum ServerRunningStatus {
    Running = 'running',
    Stopped = 'stopped',
    Restarting = 'restarting',
    Starting = 'starting',
    Stopping = 'stopping',
    Unknown = 'unknown'
}

/**
 * Instance Runner manages running time lifecycle of instances: start/stop/restart
 * and utility functions like pairing and fetching Moonlight PIN
 */
export interface InstanceRunner {

    start(opts?: StartStopOptions): Promise<void>
    stop(opts?: StartStopOptions): Promise<void>
    restart(opts?: StartStopOptions): Promise<void>

    /**
     * Returns the current running status of the instance
     */
    serverStatus(): Promise<ServerRunningStatus>

    /**
     * Interactively pair with Moonlight. This is only suitable for interactive (eg. CLI) use
     */
    pairInteractive(): Promise<void>

    /**
     * Send pairing PIN to the instance
     * @returns true if the PIN was valid and pairing was successful, false otherwise
     */
    pairSendPin(pin: string, retries?: number, retryDelay?: number): Promise<boolean>

    /**
     * Check if the streaming server is ready
     */
    isStreamingServerReady(): Promise<boolean>

}

export interface InstanceRunnerArgs<C extends CommonProvisionInputV1, O extends CommonProvisionOutputV1>  {
    instanceName: string, 
    provisionInput: C
    provisionOutput: O
    configurationInput: CommonConfigurationInputV1
}

export interface StartStopOptions {
    wait?: boolean
    waitTimeoutSeconds?: number
}

export abstract class AbstractInstanceRunner<C extends CommonProvisionInputV1, O extends CommonProvisionOutputV1> implements InstanceRunner {
    
    protected readonly logger: Logger
    protected readonly args: InstanceRunnerArgs<C, O>
    private provider: CLOUDYPAD_PROVIDER

    constructor(provider: CLOUDYPAD_PROVIDER, args: InstanceRunnerArgs<C, O>) {
        this.args = args
        this.provider = provider
        this.logger = getLogger(args.instanceName) 
    }
 
    async start(opts?: StartStopOptions): Promise<void> {
        this.logger.info(`Starting instance ${this.args.instanceName}`)
        await this.doStart(opts)
    }

    async stop(opts?: StartStopOptions): Promise<void> {
        this.logger.info(`Stopping instance ${this.args.instanceName}`)
        await this.doStop(opts)
    }

    async restart(opts?: StartStopOptions): Promise<void> {
        this.logger.info(`Restarting instance ${this.args.instanceName}`)
        await this.doRestart(opts)
    }

    async serverStatus(): Promise<ServerRunningStatus> {
        this.logger.info(`Getting instance state for ${this.args.instanceName}`) 

        try {
            return await this.doGetInstanceStatus()
        } catch (error) {
            this.logger.info(`Couldn't get server status for instance ${this.args.instanceName}.` +
                `This situation is expected (the server didn't exist, eg. has been removed).` +
                `Error: ${error}`)
            return ServerRunningStatus.Unknown
        }
    }

    protected abstract doStart(opts?: StartStopOptions): Promise<void>
    protected abstract doStop(opts?: StartStopOptions): Promise<void>
    protected abstract doRestart(opts?: StartStopOptions): Promise<void>
    protected abstract doGetInstanceStatus(): Promise<ServerRunningStatus>

    private buildMoonlightPairer(): MoonlightPairer {

        const sshClientArgs = this.buildSshClientArgs()

        if(this.args.configurationInput.sunshine?.enable){
            return new SunshineMoonlightPairer({
                instanceName: this.args.instanceName,
                host: sshClientArgs.host,
                ssh: sshClientArgs,
                sunshine: {
                    username: this.args.configurationInput.sunshine.username,
                    password: Buffer.from(this.args.configurationInput.sunshine.passwordBase64, 'base64').toString('utf-8')
                }
            })
        } else if(this.args.configurationInput.wolf?.enable){
            return new WolfMoonlightPairer({
                instanceName: this.args.instanceName,
                host: sshClientArgs.host,
                ssh: sshClientArgs
            })
        } else {
            throw new Error(`No Moonlight pairer found for instance ${this.args.instanceName}, neither Sunshine nor Wolf is enabled`)
        }
    }

    async pairSendPin(pin: string, retries?: number, retryDelay?: number): Promise<boolean> {
        const pairer = this.buildMoonlightPairer()
        return pairer.pairSendPin(pin, retries, retryDelay)
    }
    
    async pairInteractive(){
        const pairer = this.buildMoonlightPairer()
        await pairer.pairInteractive()
    }

    /**
     * Check if the streaming server is ready to accept connections.
     * current implementation uses cloudypad-check-readiness script installed on machine
     * this is an implicit interface every CloudyPad instance must have a "cloudypad-check-readiness" script installed
     * otherwise this method will always return false
     */
    async isStreamingServerReady(): Promise<boolean> {

        this.logger.debug(`Checking instance ${this.args.instanceName} readiness: checking if instance is started`)

        const status = await this.serverStatus()
        if(status !== ServerRunningStatus.Running){
            this.logger.debug(`Checking instance ${this.args.instanceName} readiness: instance is not running, returning false`)
            return false
        }

        const sshClient = this.buildSshClient()

        try {

            const isReady = await sshClient.isReady()
            if(!isReady){
                this.logger.debug(`Checking instance ${this.args.instanceName} readiness: SSH is not ready, returning false`)
                return false
            }

            this.logger.debug(`Checking instance ${this.args.instanceName} readiness: running check ssh command`)

            await sshClient.connect()

            // ignore non-zero exit code as command is expected to fail if the streaming server is not ready
            const result = await sshClient.command(['cloudypad-check-readiness'], {
                ignoreNonZeroExitCode: true
            })

            this.logger.debug(`Checking instance ${this.args.instanceName} readiness: SSH command returned ${result.code}`)

            return result.code === 0
        } catch (error) {
            this.logger.info(`Unexpected error while checking if streaming server is ready for instance ${this.args.instanceName}`, { cause: error })
            return false
        } finally {
            sshClient.dispose()
        }
    }

    /**
     * Build an SSH client for instance manager by this runner. This method is generic to use CommonProvisionInputV1 and CommonProvisionOutputV1
     * but specialized runners can override this method to provide more specific SSH client configs
     * @returns SSH client
     */
    protected buildSshClient(): SSHClient {
        return new SSHClient(this.buildSshClientArgs())
    }

    /**
     * Build an SSH client for instance manager by this runner. This method is generic to use CommonProvisionInputV1 and CommonProvisionOutputV1
     * but specialized runners can override this method to provide more specific SSH client configs
     * @returns SSH client
     */
    protected buildSshClientArgs(): SSHClientArgs {
        this.logger.debug(`Building generic SSH client args for instance ${this.args.instanceName}`)

        const sshAuth = new SshKeyLoader().getSshAuth(this.args.provisionInput.ssh)

        return {
            clientName: this.args.instanceName,
            host: this.args.provisionOutput.host,
            port: 22,
            user: this.args.provisionInput.ssh.user,
            privateKeyPath: sshAuth.privateKeyPath,
            password: sshAuth.password
        }
    }
}