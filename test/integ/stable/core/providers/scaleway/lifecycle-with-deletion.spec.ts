import * as assert from 'assert'
import { ScalewayClient, ScalewayServerState } from '../../../../../../src/providers/scaleway/sdk-client'
import { ScalewayInstanceStateV1 } from '../../../../../../src/providers/scaleway/state'
import { getIntegTestCoreConfig } from '../../../../utils'
import { ScalewayProviderClient } from '../../../../../../src/providers/scaleway/provider'
import { ServerRunningStatus } from '../../../../../../src/core/runner'
import { getLogger } from '../../../../../../src/log/utils'
import { CloudypadClient } from '../../../../../../src/core/client'

// This test is run manually using an existing instance

describe('Scaleway lifecycle with instance server deletion', () => {
    const logger = getLogger("test-scaleway-lifecycle-with-server-deletion")
    const coreConfig = getIntegTestCoreConfig()
    const scalewayProviderClient = new ScalewayProviderClient({ config: coreConfig })
    const instanceName = 'test-instance-scaleway-lifecycle-with-server-deletion'

    const projectId = "297ea06f-4231-4ee7-bd5e-cb28cec4c4ee"
    const region = "fr-par"
    const zone = "fr-par-2"

    let currentInstanceServerId: string | undefined = undefined

    async function getCurrentTestState(): Promise<ScalewayInstanceStateV1> {
        return scalewayProviderClient.getInstanceState(instanceName)
    }

    function getScalewayClient(): ScalewayClient {    
        return new ScalewayClient(instanceName, {
            projectId: projectId,
            region: region,
            zone: zone,
        })
    }
    
    it('should initialize instance state', async () => {

        assert.strictEqual(currentInstanceServerId, undefined)

        const initializer = new ScalewayProviderClient({config: coreConfig}).getInstanceInitializer()
            await initializer.initializeStateOnly(instanceName, {
                ssh: {
                    user: "ubuntu",
                },
                projectId: projectId,
                region: region,
                zone: zone,
                instanceType: "L4-1-24G",
                diskSizeGb: 30,
                dataDiskSizeGb: 50,
                deleteInstanceServerOnStop: true,
                imageId: "c0a1b6c7-649c-4bb1-8e77-8322e956a301" // pre-installed image
            }, {
                sunshine: {
                    enable: true,
                    username: "sunshine",
                    passwordBase64: Buffer.from("Sunshine!").toString('base64')
                }, 
                ansible: {
                    additionalArgs: "-t data-disk,sunshine"
                }
            })
    })

    it('should deploy instance', async () => {
        const instanceManager = await scalewayProviderClient.getInstanceManager(instanceName)
        await instanceManager.deploy()

        const scalewayClient = getScalewayClient()
        const state = await getCurrentTestState()

        assert.ok(state.provision.output?.instanceServerId)
        currentInstanceServerId = state.provision.output.instanceServerId

        const serverData = await scalewayClient.getRawServerData(currentInstanceServerId)
        assert.strictEqual(serverData?.commercialType, "L4-1-24G")
    }).timeout(360000)

    it('should update instance', async () => {
        const instanceUpdater = scalewayProviderClient.getInstanceUpdater()
        await instanceUpdater.updateStateOnly({
            instanceName: instanceName,
            provisionInputs: {
                instanceType: "GPU-3070-S",
            }, 
        })

        const instanceManager = await scalewayProviderClient.getInstanceManager(instanceName)
        await instanceManager.deploy()

        const scalewayClient = getScalewayClient()
        const state = await getCurrentTestState()

        assert.ok(state.provision.output?.instanceServerId)
        currentInstanceServerId = state.provision.output.instanceServerId

        const serverData = await scalewayClient.getRawServerData(currentInstanceServerId)
        assert.strictEqual(serverData?.commercialType, "GPU-3070-S")

    }).timeout(360000)

    it('should have a valid instance server output with existing server', async () => {
        const state = await getCurrentTestState()
        
        assert.ok(state.provision.output?.instanceServerId)
        currentInstanceServerId = state.provision.output.instanceServerId

        const scalewayClient = getScalewayClient()
        
        const serverStatus = await scalewayClient.getInstanceStatus(currentInstanceServerId)
        assert.strictEqual(serverStatus, ScalewayServerState.Running)
    }).timeout(10000)

    // run twice for idempotency
    for (let i = 0; i < 2; i++) { 

        it(`should stop instance and delete instance server (${i+1}/2 for idempotency)`, async () => {
            const instanceManager = await scalewayProviderClient.getInstanceManager(instanceName)
            await instanceManager.stop({ wait: true })

            const instanceStatus = await instanceManager.getInstanceStatus()
            assert.strictEqual(instanceStatus.configured, false)
            assert.strictEqual(instanceStatus.serverStatus, ServerRunningStatus.Unknown)

            const state = await getCurrentTestState()
            assert.strictEqual(state.provision.output?.instanceServerId, undefined)

            const scalewayClient = getScalewayClient()
            const instances = await scalewayClient.listInstances()
            const instance = instances.find(instance => instance.id === currentInstanceServerId)
            assert.strictEqual(instance, undefined)

            currentInstanceServerId = undefined
        }).timeout(120000)
    }

    // run twice for idempotency
    for (let i = 0; i < 2; i++) { 

        it(`should start instance with re-provisioning (${i+1}/2 for idempotency)`, async () => {
            const instanceManager = await scalewayProviderClient.getInstanceManager(instanceName)
            await instanceManager.start({ wait: true })

            const instanceStatus = await instanceManager.getInstanceStatus()
            assert.strictEqual(instanceStatus.configured, true)
            assert.strictEqual(instanceStatus.provisioned, true)
            assert.strictEqual(instanceStatus.serverStatus, ServerRunningStatus.Running)

            const state = await getCurrentTestState()
            assert.ok(state.provision.output?.instanceServerId)

            currentInstanceServerId = state.provision.output.instanceServerId
        }).timeout(120000)
    }

    it('should wait for instance readiness', async () => {
        const instanceManager = await scalewayProviderClient.getInstanceManager(instanceName)
        
        let isReady = false
        for (let attempt = 0; attempt < 60; attempt++) {
            isReady = await instanceManager.isReady()
            if (isReady) break
            logger.info(`Waiting for instance readiness... ${attempt + 1} / 60`)
            await new Promise(resolve => setTimeout(resolve, 5000)) // wait for 5 seconds before retrying
        }
        assert.strictEqual(isReady, true)

    }).timeout(120000)

    it('should restart instance without deleting or re-provisioning', async () => {

        const stateBefore = await getCurrentTestState()
        const serverIdBefore = stateBefore.provision.output?.instanceServerId

        assert.ok(serverIdBefore)

        const instanceManager = await scalewayProviderClient.getInstanceManager(instanceName)
        await instanceManager.restart({ wait: true })

        const stateAfter = await getCurrentTestState()
        assert.strictEqual(stateAfter.provision.output?.instanceServerId, serverIdBefore)
    }).timeout(120000)

    it('should destroy instance', async () => {
        const instanceManager = await scalewayProviderClient.getInstanceManager(instanceName)
        await instanceManager.destroy()
    }).timeout(120000)

    it('instance does not exist after destroy', async () => {
        const coreClient = new CloudypadClient({ config: coreConfig })
        const instances = await coreClient.getAllInstances()
        assert.strictEqual(instances.find(instance => instance === instanceName), undefined)
    })
    

}).timeout(360000)