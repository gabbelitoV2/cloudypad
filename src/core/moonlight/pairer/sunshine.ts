import { AbstractMoonlightPairer, makePin, MoonlightPairer } from "./abstract";
import { SSHClient, SSHClientArgs } from "../../../tools/ssh";
import { SSHExecCommandResponse } from "node-ssh";

export interface SunshineMoonlightPairerArgs {
    instanceName: string
    host: string
    ssh: SSHClientArgs,
    sunshine: {
        username: string
        password: string
    }
}

/**
 * Pair with Sunshine using Sunshine API via SSH
 */
export class SunshineMoonlightPairer extends AbstractMoonlightPairer implements MoonlightPairer {
    
    private readonly args: SunshineMoonlightPairerArgs

    constructor(args: SunshineMoonlightPairerArgs) {
        super({
            instanceName: args.instanceName,
            host: args.host
        })
        this.args = args
    }

    private buildSshClient(): SSHClient {
        return new SSHClient(this.args.ssh);
    }

    protected async doPair(pin: string) {

        const ssh = this.buildSshClient()
    
        // try to pair for 2 min by punshing through Sunshine API with our pin
        // Using plain curl + SSH command as Sunshine Web UI is not reachable directly
        // A simple but effective enough method
        // Maybe wen use a more resilient with proper HTTP client and SSH tunneling such as https://github.com/agebrock/tunnel-ssh
        await this.pairSendPin(pin, 60, 2000) // up to 60 attempts with 2 sec delay =~ 2 min
    }

    async pairSendPin(pin: string, retries=3, retryDelayMs=2000): Promise<boolean> {
        const sshClient = this.buildSshClient()
        let pinResult = false
        let lastError: unknown | undefined = undefined
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await sshClient.connect()
                pinResult = await this.tryPin(sshClient, pin)
                if (pinResult) break;
            } catch (error) {
                lastError = error
                this.logger.warn(`Attempt ${attempt + 1} failed to send pin to Sunshine API. Retrying...`, error)
            } finally {
                sshClient.dispose()
            }

            await new Promise(resolve => setTimeout(resolve, retryDelayMs))

        }

        if (!pinResult) {
            throw new Error(`Failed to send pin to Sunshine API after ${retries} attempts. Last error:`, { cause: lastError })
        }

        return pinResult
    }

    private async tryPin(ssh: SSHClient, pin: string): Promise<boolean>{

        this.logger.debug(`Trying to send pin to Sunshine API... (enable trace logs to see raw outputs)`)

        let result: SSHExecCommandResponse
        try {
            result = await ssh.command([
                'curl',
                '-v',
                '-u',
                `${this.args.sunshine.username}:${this.args.sunshine.password}`,
                '-X',
                'POST',
                '-k',
                'https://localhost:47990/api/pin',
                '-H', 'Content-Type: application/json',
                '-d',
                JSON.stringify({ pin: pin, name: this.args.instanceName })
            ])
        } catch (error) {
            this.logger.warn(`Failed to send pin to Sunshine API.`, { cause: error })
            return false
        }

        this.logger.trace(`Sunshine pair POST via SSH result: ${JSON.stringify(result)}`)

        // stdout should contain JSON such as { "status": "true" }
        // Try to parse it
        let json;
        try {
            json = JSON.parse(result.stdout);
            
            this.logger.debug(`Sunshine /api/pin POST JSON output: ${JSON.stringify(json)}`)

            // Sunshine server may respond with true (boolean) or "true" (string)
            return json.status == "true" || json.status == true
        } catch (error) {
            this.logger.warn(`Failed to parse Sunshine API JSON response from raw output ${JSON.stringify(result.stdout)}. If you think this is a bug please report it.`, error);
            return false
        }
    }
}