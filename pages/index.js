import "semantic-ui-css/semantic.min.css";
import React, { useState, useEffect } from "react";
import { Button, Form, Loader, Icon, Modal, Dropdown } from "semantic-ui-react";
import { ethers } from "ethers";
import { CCIP_BnM_Address, CCIP_LnM_Address, routerConfig, routerABI } from "./ccipConfig";

const backgroundStyle = {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
    minHeight: "100vh",
    padding: "20px",
};

const NETWORK_OPTIONS = [
    { key: 'astar', value: 'astar', text: 'Astar', icon: 'ethereum' },
    { key: 'soneium', value: 'soneium', text: 'Soneium', icon: 'snowflake outline' },
];

const Index = () => {
    const [state, setState] = useState({
        address: '',
        amount: '',
        sourceChain: 'astar',
        destChain: 'soneium',
        tokenAddress: CCIP_BnM_Address,
        feeToken: "0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720",
        loading: false,
        approved: false,
        txHash: '',
        allowance: 0, // Добавлено для хранения текущего allowance
    });

    // Проверка текущего allowance
    const checkAllowance = async () => {
        if (!state.address || !state.amount) return;

        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const tokenContract = new ethers.Contract(
                state.tokenAddress,
                ['function allowance(address owner, address spender) view returns (uint256)'],
                provider
            );

            const allowance = await tokenContract.allowance(
                state.address,
                routerConfig[state.sourceChain].address
            );

            setState(prev => ({
                ...prev,
                allowance: parseFloat(ethers.utils.formatEther(allowance)),
                approved: parseFloat(prev.amount) <= parseFloat(ethers.utils.formatEther(allowance)),
            }));
        } catch (error) {
            console.error("Allowance check failed:", error);
        }
    };

    useEffect(() => {
        checkAllowance();
    }, [state.address, state.amount, state.sourceChain, state.tokenAddress]);

    const connectWallet = async () => {
        try {
            const { ethereum } = window;
            if (!ethereum) throw new Error("MetaMask not installed");

            const accounts = await ethereum.request({ 
                method: 'eth_requestAccounts' 
            });

            setState(prev => ({
                ...prev,
                address: accounts[0]
            }));
        } catch (error) {
            console.error("Wallet connection failed:", error);
        }
    };

    const handleApprove = async () => {
        try {
            setState(prev => ({ ...prev, loading: true }));

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const tokenContract = new ethers.Contract(
                state.tokenAddress,
                ['function approve(address spender, uint256 amount)'],
                signer
            );

            const tx = await tokenContract.approve(
                routerConfig[state.sourceChain].address,
                ethers.utils.parseEther(state.amount)
            );

            await tx.wait();
            setState(prev => ({ ...prev, approved: true, loading: false }));
            checkAllowance(); // Обновляем allowance после успешного аппрува
        } catch (error) {
            console.error("Approval failed:", error);
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    const sendCrossChain = async () => {
        try {
            setState(prev => ({ ...prev, loading: true }));

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();

            const router = new ethers.Contract(
                routerConfig[state.sourceChain].address,
                routerABI,
                signer
            );

            const message = {
                receiver: ethers.utils.defaultAbiCoder.encode(
                    ['address'],
                    [state.address]
                ),
                data: "0x",
                tokenAmounts: [{
                    token: state.tokenAddress,
                    amount: ethers.utils.parseEther(state.amount)
                }],
                feeToken: ethers.constants.AddressZero,
                extraArgs: ethers.utils.defaultAbiCoder.encode(
                    ['bytes4', 'uint256'],
                    [0x97a657c9, 2_000_000]
                )
            };

            const fee = await router.getFee(
                routerConfig[state.destChain].chainSelector,
                message
            );

            const tx = await router.ccipSend(
                routerConfig[state.destChain].chainSelector,
                message,
                { value: fee }
            );

            setState(prev => ({
                ...prev,
                txHash: tx.hash,
                loading: false,
                amount: ''
            }));
        } catch (error) {
            console.error("CCIP transfer failed:", error);
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    return (
        <div style={backgroundStyle}>
            <div className="ui centered cards" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div className="ui card" style={{
                    background: 'rgba(32, 32, 48, 0.95)',
                    color: 'white',
                    width: '100%',
                    padding: '20px',
                    borderRadius: '15px'
                }}>
                    <h2 style={{ textAlign: 'center', color: '#3BB1E6' }}>
                        <Icon name="exchange" /> xnASTR bridge
                    </h2>

                    {/* Wallet Connection */}
                    <div style={{ marginBottom: '20px' }}>
                        <Button 
                            fluid 
                            color={state.address ? 'green' : 'blue'} 
                            onClick={connectWallet}
                            style={{ borderRadius: '12px' }}
                        >
                            {state.address ? 
                                `Connected: ${state.address.slice(0, 6)}...${state.address.slice(-4)}` : 
                                'Connect Wallet'}
                        </Button>
                    </div>

                    {/* Network Selection */}
                    <div className="ui two column grid">
                        <div className="column">
                            <Dropdown
                                fluid
                                selection
                                options={NETWORK_OPTIONS}
                                value={state.sourceChain}
                                onChange={(e, { value }) => 
                                    setState(prev => ({ ...prev, sourceChain: value }))
                                }
                                labeled
                                placeholder="From Chain"
                            />
                        </div>
                        <div className="column">
                            <Dropdown
                                fluid
                                selection
                                options={NETWORK_OPTIONS}
                                value={state.destChain}
                                onChange={(e, { value }) => 
                                    setState(prev => ({ ...prev, destChain: value }))
                                }
                                labeled
                                placeholder="To Chain"
                            />
                        </div>
                    </div>

                    {/* Amount Input */}
                    <Form style={{ marginTop: '20px' }}>
                        <Form.Input
                            type="number"
                            placeholder="Amount to transfer"
                            value={state.amount}
                            onChange={(e) => 
                                setState(prev => ({ ...prev, amount: e.target.value }))
                            }
                            style={{
                                background: '#2a2a3c',
                                color: 'white',
                                border: '1px solid #3BB1E6',
                                borderRadius: '12px'
                            }}
                        />
                    </Form>

                    {/* Actions */}
                    <div className="ui two buttons" style={{ marginTop: '20px' }}>
                        <Button 
                            color="teal" 
                            onClick={handleApprove}
                            disabled={!state.amount || state.loading || state.allowance >= parseFloat(state.amount)}
                            loading={state.loading && !state.approved}
                        >
                            {state.approved ? 
                                <><Icon name="check" /> Approved</> : 
                                'Approve Tokens'}
                        </Button>
                        
                        <Button 
                            color="blue" 
                            onClick={sendCrossChain}
                            disabled={!state.approved || state.loading || state.allowance < parseFloat(state.amount)}
                            loading={state.loading && state.approved}
                        >
                            <Icon name="random" /> Bridge Now
                        </Button>
                    </div>

                    {/* Transaction Status */}
                    {state.txHash && (
                        <div style={{ 
                            marginTop: '20px', 
                            padding: '10px',
                            background: 'rgba(59, 177, 230, 0.1)',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <a 
                                href={`https://ccip.chain.link/address/${state.address}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ color: '#3BB1E6' }}
                            >
                                View Transaction
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Index;