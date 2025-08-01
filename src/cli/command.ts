import { Command, Option } from "@commander-js/extra-typings";
import { PUBLIC_IP_TYPE, PUBLIC_IP_TYPE_DYNAMIC, PUBLIC_IP_TYPE_STATIC } from "../core/const";
import { AnalyticsManager } from "../tools/analytics/manager";
import { CoreConfig } from "../core/config/interface";

//
// Common CLI Option each providers can re-use
//

/**
 * Arguments any Provider can take as parameter for create command
 */
export interface CreateCliArgs {
    name?: string
    sshPrivateKey?: string
    yes?: boolean // auto approve
    overwriteExisting?: boolean
    skipPairing?: boolean
    streamingServer?: string
    sunshineUser?: string
    sunshinePassword?: string
    sunshineImageTag?: string
    sunshineImageRegistry?: string
    autostop?: boolean
    autostopTimeout?: number
    useLocale?: string | null
    keyboardLayout?: string
    keyboardModel?: string
    keyboardVariant?: string
    keyboardOptions?: string
    ansibleAdditionalArgs?: string
    retries?: number
    retryDelay?: number
}

/**
 * Arguments any Provider can take as parameter for update command. Omit config that cannot/shouldn't be updated
 * - sshCrivateKey: updating would recreated the instance entirely. Since root volume is used to persist data, it would be lost. 
 *  May be supported once we persist data in a dedicated volume.
 * - streamingServer: too complex to handle as it would leave behind existing streaming server data and config. Maybe possible in the future.
 */
export type UpdateCliArgs = Omit<CreateCliArgs, | "sshPrivateKey" | "streamingServer" > & { name: string }

export const CLI_OPTION_INSTANCE_NAME = new Option('--name <name>', 'Instance name')

// same flags but ssh-private-key is preferred (to play better with ssh provider ssh-user and ssh-password), hide the legacy one
export const CLI_OPTION_PRIVATE_SSH_KEY_OLD = new Option('--private-ssh-key <path>', 'Path to private SSH key to use to connect to instance', )
export const CLI_OPTION_PRIVATE_SSH_KEY = new Option('--ssh-private-key <path>', 'Path to private SSH key to use to connect to instance')

export const CLI_OPTION_AUTO_APPROVE = new Option('--yes', 'Do not prompt for approval, automatically approve and continue')
export const CLI_OPTION_OVERWRITE_EXISTING = new Option('--overwrite-existing', 'If an instance with the same name already exists, override without warning prompt')

export const CLI_OPTION_USE_LOCALE = new Option('--use-locale <locale>', 'Locale that will be set on instance (eg. "en_US.UTF-8" or "fr_FR.UTF-8"). Default: use same locale as system.')
export const CLI_OPTION_KEYBOARD_LAYOUT = new Option('--keyboard-layout <layout>', 'Keyboard layout that will be set on instance (eg. "us" or "fr"). Default: detected from system.')
export const CLI_OPTION_KEYBOARD_VARIANT = new Option('--keyboard-variant <variant>', 'Keyboard variant that will be set on instance (eg. "azerty", "qwerty" or "mac"). Default: detected from system.')
export const CLI_OPTION_KEYBOARD_MODEL = new Option('--keyboard-model <model>', 'Keyboard model that will be set on instance (eg. "apple" or "pc105"). Default: detected from system.')
export const CLI_OPTION_KEYBOARD_OPTIONS = new Option('--keyboard-options <options>', 'Keyboard options that will be set on instance (eg. "ctrl:swap_lalt_lctl" or "compose:menu"). Default: detected from system.')

export const CLI_OPTION_SPOT = new Option('--spot [disable|no|false|0]', 'Enable Spot instance. Spot instances are cheaper' + 
        '(usually 20% to 70% off) but may be restarted any time.')
    .argParser(parseFalseOrDisable)

export const CLI_OPTION_DISK_SIZE = new Option('--disk-size <size>', 'Disk size in GB')
    .argParser(parseInt)

// root / data disk size will eventually replace simple "disk size" while separation between OS and data is being worked on
export const CLI_OPTION_ROOT_DISK_SIZE = new Option('--root-disk-size <size>', 'Root disk size in GB (for OS and system)')
    .argParser(parseInt)
export const CLI_OPTION_DATA_DISK_SIZE = new Option('--data-disk-size <size>', 'Data disk size in GB (for game data)')
    .argParser(parseInt)

export const CLI_OPTION_PUBLIC_IP_TYPE = new Option('--public-ip-type <type>', `Public IP type. Either ${PUBLIC_IP_TYPE_STATIC} or ${PUBLIC_IP_TYPE_DYNAMIC}`)
    .argParser(parsePublicIpType)
export const CLI_OPTION_SKIP_PAIRING = new Option('--skip-pairing', 'Skip Moonlight pairing after initial provisioning and configuration')

export const CLI_OPTION_COST_ALERT = new Option('--cost-alert [disable|no|false|0]', 'Enable or disable cost alert.' + 
        'Will prompt for cost alert limit and notification email unless --cost-limit and --cost-notification-email are provided. ' +
        'Passing "disable", "no", "0" or "false" will disable cost alerts.')
    .argParser(parseFalseOrDisable)
export const CLI_OPTION_COST_LIMIT = new Option('--cost-limit <limit>', 'Cost alert limit (USD). Imply --cost-alert.').argParser((l) => {
    if(isNaN(parseInt(l))) {
        throw new Error('Cost alert limit must be a valid number')
    }
    return parseInt(l)
})
export const CLI_OPTION_COST_NOTIFICATION_EMAIL = new Option('--cost-notification-email <email>', 'Cost alert notification email. Imply --cost-alert.')

export const CLI_OPTION_DELETE_INSTANCE_SERVER_ON_STOP = new Option('--delete-instance-server-on-stop [enable|yes|true|1]', 
    'Whether to delete instance server on stop. ' +
    'If enabled, instance server will be destroyed on stop and recreated on next start (along with provisioning and configuration).')
    .argParser(parseFalseOrDisable)

export const CLI_OPTION_STREAMING_SERVER = new Option('--streaming-server <name>', 'Streaming server to use. Either "sunshine" or "wolf"')
export const CLI_OPTION_SUNSHINE_USERNAME = new Option('--sunshine-user <name>', 'Sunshine username (ignored if streaming server is not sunshine)')
export const CLI_OPTION_SUNSHINE_PASSWORD = new Option('--sunshine-password <password>', 'Sunshine password (ignored if streaming server is not sunshine)')
export const CLI_OPTION_SUNSHINE_IMAGE_TAG = new Option('--sunshine-image-tag <tag>', 'Sunshine container image tag (ignored if streaming server is not sunshine)')
export const CLI_OPTION_SUNSHINE_IMAGE_REGISTRY = new Option('--sunshine-image-registry <registry>', 'Sunshine container image registry (ignored if streaming server is not sunshine)')

export const CLI_OPTION_AUTO_STOP_ENABLE = new Option('--autostop [disable|no|false|0]', 'Enable Auto Stop to shutdown the instance automatically when inactivity is detected')
    .argParser(parseFalseOrDisable)
export const CLI_OPTION_AUTO_STOP_TIMEOUT = new Option('--autostop-timeout <seconds>', 'Auto Stop timeout in seconds')
    .argParser(parseInt)

export const CLI_OPTION_ANSIBLE_ADDITIONAL_ARGS = new Option('--ansible-additional-args <args>', 'Additional Ansible arguments to pass to configuration, eg. "--tags data-disk -vvv"')

export const CLI_OPTION_RETRIES = new Option('--retries <number>', 'Number of retries when deploying, configuring, starting, stopping or destroying instance')
    .argParser(parseInt)
export const CLI_OPTION_RETRY_DELAY = new Option('--retry-delay <seconds>', 'Retry delay in seconds when deploying, configuring, starting, stopping or destroying instance')
    .argParser(parseInt)


function parseFalseOrDisable(value: string){
    return value === "disable" || value === "no" || value === "false" || value === "0" ? false : true
}

export interface BuildCreateCommandArgs {
    coreConfig: CoreConfig
}

export interface BuildUpdateCommandArgs {
    coreConfig: CoreConfig
}

/**
 * Helper to create a Commander CLI sub-commands for create and update commands.
 */
export abstract class CliCommandGenerator {

    protected analytics = AnalyticsManager.get()

    /**
     * Create a base 'create' command for a given provider name with possibilities to chain with additional options.
     */
    protected getBaseCreateCommand(provider: string){
        return new Command(provider)
            .description(`Create a new Cloudy Pad instance using ${provider} provider.`)
            .addOption(CLI_OPTION_INSTANCE_NAME)
            .addOption(CLI_OPTION_PRIVATE_SSH_KEY_OLD)
            .addOption(CLI_OPTION_PRIVATE_SSH_KEY)
            .addOption(CLI_OPTION_AUTO_APPROVE)
            .addOption(CLI_OPTION_OVERWRITE_EXISTING)
            .addOption(CLI_OPTION_SKIP_PAIRING)
            .addOption(CLI_OPTION_ANSIBLE_ADDITIONAL_ARGS)
            .addOption(CLI_OPTION_RETRIES)
            .addOption(CLI_OPTION_RETRY_DELAY)
    }

    /**
     * Create a base 'update' command for a given provider name with possibilities to chain with additional options.
     */
    protected getBaseUpdateCommand(provider: string){
        return new Command(provider)
            .description(`Update an existing Cloudy Pad instance using ${provider} provider.`)
            .requiredOption('--name <name>', 'Instance name')
            .addOption(CLI_OPTION_AUTO_APPROVE)
            .addOption(CLI_OPTION_ANSIBLE_ADDITIONAL_ARGS)
            .addOption(CLI_OPTION_RETRIES)
            .addOption(CLI_OPTION_RETRY_DELAY)
    }

    /**
     * Build a 'create' Command for Commander CLI using provided Command
     */
    abstract buildCreateCommand(args: BuildCreateCommandArgs): Command<[]>

    /**
     * Build an 'update' Command for Commander CLI using provided Command
     */
    abstract buildUpdateCommand(args: BuildUpdateCommandArgs): Command<[]>

}

export function parsePublicIpType(value: string): PUBLIC_IP_TYPE {
    if (value !== PUBLIC_IP_TYPE_STATIC && value !== PUBLIC_IP_TYPE_DYNAMIC) {
        throw new Error(`Invalid value for --public-ip-type. Either "${PUBLIC_IP_TYPE_STATIC}" or "${PUBLIC_IP_TYPE_DYNAMIC}"`)
    }
    return value
}
