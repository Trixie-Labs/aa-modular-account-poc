import { config } from "dotenv"
import { ChainId, UserOperation } from "@biconomy/core-types"
import { IBundler, Bundler } from '@biconomy/bundler'
import { BiconomySmartAccountV2, DEFAULT_ENTRYPOINT_ADDRESS } from "@biconomy/account"
import { ECDSAOwnershipValidationModule, DEFAULT_ECDSA_OWNERSHIP_MODULE } from "@biconomy/modules";
import { ethers } from 'ethers';

import {
    IPaymaster,
    BiconomyPaymaster,
    PaymasterMode,
} from '@biconomy/paymaster'
import { arrayify } from "ethers/lib/utils";

config()

type UserOperationKey = keyof UserOperation;

const provider = new ethers.providers.JsonRpcProvider("https://rpc.ankr.com/polygon_mumbai")
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
const wallet3 = new ethers.Wallet(process.env.PRIVATE_KEY_A3 || "", provider);

const paymaster: IPaymaster = new BiconomyPaymaster({
    paymasterUrl: 'https://paymaster.biconomy.io/api/v1/80001/L7o3s0AJT.cd6e4e03-ed3d-484b-baa9-5c30a9bbdaa4'
})

const bundler: IBundler = new Bundler({
    bundlerUrl: 'https://bundler.biconomy.io/api/v2/80001/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44',
    chainId: ChainId.POLYGON_MUMBAI,
    entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
})

async function createSmartAccount() {
    const module = await ECDSAOwnershipValidationModule.create({
        signer: wallet,
        moduleAddress: DEFAULT_ECDSA_OWNERSHIP_MODULE,
    });

    let biconomyAccount = await BiconomySmartAccountV2.create({
        chainId: ChainId.POLYGON_MUMBAI,
        bundler: bundler,
        paymaster: paymaster,
        entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
        defaultValidationModule: module,
        activeValidationModule: module,
    });
    console.log("address", await biconomyAccount.getAccountAddress());
    return biconomyAccount;
}

async function createTransaction() {
    console.log("creating account")

    const smartAccount = await createSmartAccount();

    const transaction = {
        to: '0x4276653514F9206c2cB371DF4D530f6fEe0EDE17',
        data: '0x',
        value: ethers.utils.parseEther('0.01'),
    }

    const userOp = await smartAccount.buildUserOp([transaction])
    userOp.paymasterAndData = "0x"

    const userOpResponse = await smartAccount.sendUserOp(userOp)

    const transactionDetail = await userOpResponse.wait()

    console.log("transaction detail below")
    console.log(`https://mumbai.polygonscan.com/tx/${transactionDetail.receipt.transactionHash}`)
}

async function createToken() {
    const smartAccount = await createSmartAccount();
    //const address = await smartAccount.getAccountAddress();
    const factoryInterface = new ethers.utils.Interface([
        "function getERC20Instance(string memory name, string memory symbol)",
    ]);

    let name = "Test01"
    let symbol = "TST";

    const data = factoryInterface.encodeFunctionData("getERC20Instance", [name, symbol]);

    const factoryAddress = "0x1b2b09AbAF2C77cD07541ae958Ea31c00665d65f";

    const transaction = {
        to: factoryAddress,
        data: data,
    };

    console.log(transaction);

    try {
        
        let partialUserOp = await smartAccount.buildUserOp([transaction], {
            paymasterServiceData: {
                mode: PaymasterMode.SPONSORED,
            },
        });
        console.log(partialUserOp);
        const userOpResponse = await smartAccount.sendUserOp(partialUserOp);
        const transactionDetails = await userOpResponse.wait();
        console.log(
            `transactionDetails: https://mumbai.polygonscan.com/tx/${transactionDetails.receipt.transactionHash}`,
        );
    } catch (e) {
        console.log("error received ", e);
    }
}

async function enableModule() {
    const smartAccount = await createSmartAccount();
    const address = await smartAccount.getAccountAddress();
    const factoryInterface = new ethers.utils.Interface([
        "function enableModule(address module)",
    ]);

    let moduleAddress = "0x006a6Bea048809c6417487B4636ea8C1A3ed559C"

    const data = factoryInterface.encodeFunctionData("enableModule", [moduleAddress]);

    const transaction = {
        to: address,
        data: data,
    };

 
    try {
        
        let partialUserOp = await smartAccount.buildUserOp([transaction], {
            paymasterServiceData: {
                mode: PaymasterMode.SPONSORED,
            },
        });

        const userOpResponse = await smartAccount.sendUserOp(partialUserOp);
        const transactionDetails = await userOpResponse.wait();
        console.log(
            `transactionDetails: https://mumbai.polygonscan.com/tx/${transactionDetails.receipt.transactionHash}`,
        );
    } catch (e) {
        console.log("error received ", e);
    }
}

async function useNewModule() {
    const smartAccount = await createSmartAccount();
    const address = await smartAccount.getAccountAddress();
    const validatorModuleAddress = "0x006a6Bea048809c6417487B4636ea8C1A3ed559C";
    const factoryInterface = new ethers.utils.Interface([
        "function getERC20Instance(string memory name, string memory symbol)",
    ]);

    let name = "Test02"
    let symbol = "VTR";

    const data = factoryInterface.encodeFunctionData("getERC20Instance", [name, symbol]);

    const factoryAddress = "0x1b2b09AbAF2C77cD07541ae958Ea31c00665d65f";

    const transaction = {
        to: factoryAddress,
        data: data,
    };

    console.log(transaction);

 
    try {
        console.log("partialUserOp");
        let partialUserOp = await smartAccount.buildUserOp([transaction], {
            paymasterServiceData: {
                mode: PaymasterMode.SPONSORED,
            }
        });
        console.log(partialUserOp);
        
        delete partialUserOp.signature;
        const requiredFields: UserOperationKey[] = [
            "sender",
            "nonce",
            "initCode",
            "callData",
            "callGasLimit",
            "verificationGasLimit",
            "preVerificationGas",
            "maxFeePerGas",
            "maxPriorityFeePerGas",
            "paymasterAndData",
          ];
        smartAccount.validateUserOp(partialUserOp, requiredFields);
        const userOpHash = await smartAccount.getUserOpHash(partialUserOp);
        const sig = await wallet3.signMessage(arrayify(userOpHash));
        console.log("ecdsa signature ", sig);
        const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
            ["bytes", "address"],
            [sig, validatorModuleAddress],
          );
        console.log("ecdsa signature with module address", signatureWithModuleAddress);
        partialUserOp.signature = signatureWithModuleAddress;
        const userOpResponse = await smartAccount.sendSignedUserOp(partialUserOp as UserOperation)
        const transactionDetails = await userOpResponse.wait();
        console.log(
            `transactionDetails: https://mumbai.polygonscan.com/tx/${transactionDetails.receipt.transactionHash}`,
        );
    } catch (e) {
        console.log("error received ", e);
    }
}

useNewModule()

//enableModule()

//createToken()