import "semantic-ui-css/semantic.min.css";
import React, { useState, useEffect } from "react";
import { Button, Form, Icon, Label } from "semantic-ui-react";
import { ethers } from "ethers";
import { CCIP_BnM_Address, routerConfig, routerABI } from "./ccipConfig";

const backgroundStyle = {
    background:
        "radial-gradient(100% 100% at 50% 0%, #020202 0%,rgb(34, 34, 34) 100%)",
    minHeight: "100vh",
    padding: "20px",
    color: "#E2E8F0",
    fontFamily: "'Inter', sans-serif",
    position: "relative",
};

const Index = () => {
    const [state, setState] = useState({
        address: "",
        amount: "",
        sourceChain: "astar",
        destChain: "soneium",
        tokenAddress: CCIP_BnM_Address,
        feeToken: "0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720",
        loading: false,
        approved: false,
        txHash: "",
        allowance: 0,
        balance: 0,
        fee: 0,
        networkError: null,
    });

    useEffect(() => {
        const checkAndUpdate = async () => {
            const networkError = await checkNetwork();
            if (networkError) {
                setState((prev) => ({ ...prev, networkError }));
            } else {
                setState((prev) => ({ ...prev, networkError: null }));
                checkAllowance();
                calculateFee();
                if (state.address) getBalance();
            }
        };
        checkAndUpdate();

        // Listen for network changes in MetaMask
        if (window.ethereum) {
            window.ethereum.on("chainChanged", async () => {
                await checkAndUpdate();
                window.location.reload(); // Reload the page to reflect network changes
            });
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener("chainChanged", async () => {});
            }
        };
    }, [state.amount, state.address]);

    // Получение баланса пользователя
    const getBalance = async () => {
        if (!state.address) return;

        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const tokenContract = new ethers.Contract(
                state.tokenAddress,
                ["function balanceOf(address owner) view returns (uint256)"],
                provider
            );

            const balance = await tokenContract.balanceOf(state.address);
            setState((prev) => ({
                ...prev,
                balance: parseFloat(ethers.utils.formatEther(balance)),
            }));
        } catch (error) {
            console.error("Balance check failed:", error);
        }
    };

    // Расчет комиссии
    const calculateFee = async () => {
        if (
            !state.amount ||
            isNaN(state.amount) ||
            parseFloat(state.amount) <= 0
        ) {
            setState((prev) => ({ ...prev, fee: 0 }));
            return;
        }

        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const router = new ethers.Contract(
                routerConfig[state.sourceChain].address,
                routerABI,
                provider
            );

            const message = {
                receiver: ethers.utils.defaultAbiCoder.encode(
                    ["address"],
                    [state.address]
                ),
                data: "0x",
                tokenAmounts: [
                    {
                        token: state.tokenAddress,
                        amount: ethers.utils.parseEther(state.amount),
                    },
                ],
                feeToken: ethers.constants.AddressZero,
                extraArgs: ethers.utils.defaultAbiCoder.encode(
                    ["bytes4", "uint256"],
                    [0x97a657c9, 2_000_000]
                ),
            };

            const fee = await router.getFee(
                routerConfig[state.destChain].chainSelector,
                message
            );

            setState((prev) => ({
                ...prev,
                fee: parseFloat(ethers.utils.formatEther(fee)),
            }));
        } catch (error) {
            console.error("Fee calculation failed:", error);
        }
    };

    const connectWallet = async () => {
        try {
            const { ethereum } = window;
            if (!ethereum) throw new Error("MetaMask not installed");

            const accounts = await ethereum.request({
                method: "eth_requestAccounts",
            });

            setState((prev) => ({
                ...prev,
                address: accounts[0],
            }));
        } catch (error) {
            console.error("Wallet connection failed:", error);
        }
    };

    const handleApprove = async () => {
        try {
            setState((prev) => ({ ...prev, loading: true }));

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const tokenContract = new ethers.Contract(
                state.tokenAddress,
                ["function approve(address spender, uint256 amount)"],
                signer
            );

            const tx = await tokenContract.approve(
                routerConfig[state.sourceChain].address,
                ethers.utils.parseEther(state.amount)
            );

            await tx.wait();
            setState((prev) => ({ ...prev, approved: true, loading: false }));
            checkAllowance(); // Обновляем allowance после успешного аппрува
        } catch (error) {
            console.error("Approval failed:", error);
            setState((prev) => ({ ...prev, loading: false }));
        }
    };

    const checkAllowance = async () => {
        if (!state.address || !state.amount) return;

        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const tokenContract = new ethers.Contract(
                state.tokenAddress,
                [
                    "function allowance(address owner, address spender) view returns (uint256)",
                ],
                provider
            );

            const allowance = await tokenContract.allowance(
                state.address,
                routerConfig[state.sourceChain].address
            );

            setState((prev) => ({
                ...prev,
                allowance: parseFloat(ethers.utils.formatEther(allowance)),
                approved:
                    parseFloat(prev.amount) <=
                    parseFloat(ethers.utils.formatEther(allowance)),
            }));
        } catch (error) {
            console.error("Allowance check failed:", error);
        }
    };

    const sendCrossChain = async () => {
        try {
            setState((prev) => ({ ...prev, loading: true }));

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();

            const router = new ethers.Contract(
                routerConfig[state.sourceChain].address,
                routerABI,
                signer
            );

            const message = {
                receiver: ethers.utils.defaultAbiCoder.encode(
                    ["address"],
                    [state.address]
                ),
                data: "0x",
                tokenAmounts: [
                    {
                        token: state.tokenAddress,
                        amount: ethers.utils.parseEther(state.amount),
                    },
                ],
                feeToken: ethers.constants.AddressZero,
                extraArgs: ethers.utils.defaultAbiCoder.encode(
                    ["bytes4", "uint256"],
                    [0x97a657c9, 2_000_000]
                ),
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

            setState((prev) => ({
                ...prev,
                txHash: tx.hash,
                loading: false,
                amount: "",
            }));
        } catch (error) {
            console.error("CCIP transfer failed:", error);
            setState((prev) => ({ ...prev, loading: false }));
        }
    };

    // Check if the current network is Astar
    const checkNetwork = async () => {
        if (window.ethereum) {
            try {
                const chainId = await window.ethereum.request({
                    method: "eth_chainId",
                });
                const astarChainId = "0x250"; // Astar's chain ID in hexadecimal

                if (chainId !== astarChainId) {
                    return "Please switch to the Astar network.";
                }
                return null; // Network is correct
            } catch (error) {
                console.error("Error checking network:", error);
                return "Error checking network. Please try again.";
            }
        } else {
            return "Please install MetaMask to interact with this application.";
        }
    };

    return (
        <div style={backgroundStyle}>
            <div
                style={{
                    maxWidth: "480px",
                    margin: "2rem auto",
                    position: "relative",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: "-20px", // Adjust this value to position the logo above the block
                        left: "15px", // Aligned with the left edge of the inner block
                        zIndex: 1001, // Higher than error message
                    }}
                >
                    <a
                        href="/"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none",
                        }}
                    >
                        <img
                            src="/images/logo.png"
                            alt="Algem Logo"
                            style={{
                                height: "30px", // Adjust based on your logo's actual height
                                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
                            }}
                        />
                        <span
                            style={{
                                color: "#E2E8F0",
                                fontSize: "1.5rem",
                                fontWeight: "600",
                                letterSpacing: "-0.5px",
                            }}
                        >
                            {/* No text here currently */}
                        </span>
                    </a>
                </div>
                {state.networkError && (
                    <div
                        style={{
                            background: "rgba(220, 53, 69, 0.8)", // Red background for error
                            color: "white",
                            padding: "1rem",
                            borderRadius: "12px",
                            marginTop: "1rem", // Space below logo
                            textAlign: "center",
                            fontWeight: "bold",
                            maxWidth: "480px",
                            margin: "0 auto", // Center the error message
                            position: "relative",
                            zIndex: 1000, // Below logo
                        }}
                    >
                        {state.networkError}
                    </div>
                )}
            </div>
            <div
                style={{
                    maxWidth: "480px",
                    margin: "2rem auto",
                    marginTop: state.networkError ? "7rem" : "5rem", // Adjust margin based on error message visibility
                    position: "relative",
                }}
            >
                <div
                    style={{
                        maxWidth: "480px",
                        margin: "2rem auto",
                        position: "relative",
                    }}
                >
                    <div
                        style={{
                            background: "#212223",
                            borderRadius: "20px",
                            border: "1px solid #323233",
                            padding: "2rem",
                            backdropFilter: "blur(10px)",
                            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                        }}
                    >
                        <h1
                            style={{
                                textAlign: "left",
                                fontSize: "1.2rem",
                                fontWeight: "300",
                                marginBottom: "1.5rem",
                                color: "#939598",
                                WebkitBackgroundClip: "text",
                            }}
                        >
                            <Icon name="exchange" /> Bridge xnASTR to Soneium
                        </h1>

                        {/* Rest of your component content */}
                        {/* Wallet Connection */}
                        <Button
                            fluid
                            style={{
                                background: state.address
                                    ? "transparent"
                                    : "#29ffb2",
                                color: state.address ? "white" : "black",
                                border: state.address
                                    ? "1px solid #444444"
                                    : "1px solid #29ffb2",
                                borderRadius: "12px",
                                padding: "14px",
                                fontWeight: "500",
                                marginBottom: "1.5rem",
                                transition: "all 0.2s ease",
                            }}
                            onClick={connectWallet}
                        >
                            {state.address
                                ? `0x...${state.address.slice(-4)}`
                                : "Connect Wallet"}
                        </Button>

                        {/* Chain Display */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "1.5rem",
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    padding: "1rem",
                                    background: "#212223",
                                    border: "1px solid #444444",
                                    borderRadius: "12px",
                                    marginRight: "0.5rem",
                                    textAlign: "center",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                }}
                            >
                                <img
                                    src="/images/astar_logo.png"
                                    alt="Astar Logo"
                                    style={{
                                        width: "30px",
                                        height: "30px",
                                        marginBottom: "0.5rem",
                                    }}
                                />
                                <div
                                    style={{
                                        color: "#94A3B8",
                                        fontSize: "0.875rem",
                                    }}
                                >
                                    From
                                </div>
                                <div style={{ fontWeight: "600" }}>Astar</div>
                            </div>

                            <Icon
                                name="arrow right"
                                style={{
                                    alignSelf: "center",
                                    color: "#64748B",
                                    margin: "0 0.5rem",
                                }}
                            />

                            <div
                                style={{
                                    flex: 1,
                                    padding: "1rem",
                                    background: "#212223",
                                    border: "1px solid #444444",
                                    borderRadius: "12px",
                                    marginLeft: "0.5rem",
                                    textAlign: "center",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                }}
                            >
                                <img
                                    src="/images/soneium_logo.png"
                                    alt="Soneium Logo"
                                    style={{
                                        width: "30px",
                                        height: "30px",
                                        marginBottom: "0.5rem",
                                    }}
                                />
                                <div
                                    style={{
                                        color: "#94A3B8",
                                        fontSize: "0.875rem",
                                    }}
                                >
                                    To
                                </div>
                                <div style={{ fontWeight: "600" }}>Soneium</div>
                            </div>
                        </div>

                        {/* Balance Info */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "1rem",
                                fontSize: "0.875rem",
                            }}
                        >
                            <span style={{ color: "#94A3B8" }}>Available:</span>
                            <span style={{ fontWeight: "500" }}>
                                {state.balance.toFixed(4)} xnASTR
                            </span>
                        </div>

                        {/* Amount Input */}
                        <Form>
                            <div style={{ position: "relative" }}>
                                <input
                                    type="number"
                                    placeholder="0.0"
                                    value={state.amount}
                                    onChange={(e) =>
                                        setState((prev) => ({
                                            ...prev,
                                            amount: e.target.value,
                                        }))
                                    }
                                    style={{
                                        width: "100%",
                                        background: "#212223",
                                        border: "1px solid #444444",
                                        borderRadius: "12px",
                                        padding: "16px",
                                        fontSize: "1.125rem",
                                        color: "#F8FAFC",
                                        outline: "none",
                                        transition: "all 0.2s ease",
                                    }}
                                />
                                <button
                                    style={{
                                        position: "absolute",
                                        right: "8px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "rgba(162, 162, 162, 0.1)",
                                        color: "#939598",
                                        border: "none",
                                        borderRadius: "8px",
                                        padding: "4px 8px",
                                        fontSize: "0.875rem",
                                        cursor: "pointer",
                                    }}
                                    onClick={async () => {
                                        setState((prev) => ({
                                            ...prev,
                                            amount: prev.balance.toString(),
                                        }));
                                        await calculateFee();
                                    }}
                                >
                                    MAX
                                </button>
                            </div>
                        </Form>

                        {/* Fee Info */}
                        <div
                            style={{
                                margin: "1rem 0",
                                padding: "1rem",
                                background: "#212223",
                                border: "1px solid #444444",
                                borderRadius: "12px",
                                fontSize: "0.875rem",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "0.5rem",
                                }}
                            >
                                <span style={{ color: "#94A3B8" }}>
                                    Estimated Fee:
                                </span>
                                <span>{state.fee.toFixed(4)} ETH</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: "grid", gap: "1rem" }}>
                            <Button
                                loading={state.loading && !state.approved}
                                style={{
                                    background: state.approved
                                        ? "#29ffb2"
                                        : "#29ffb2",
                                    color: "black",
                                    borderRadius: "12px",
                                    padding: "16px",
                                    fontWeight: "500",
                                    transition: "all 0.2s ease",
                                    opacity: state.loading ? 0.7 : 1,
                                }}
                                onClick={
                                    state.approved
                                        ? sendCrossChain
                                        : handleApprove
                                }
                                disabled={
                                    state.loading ||
                                    (!state.approved &&
                                        (!state.amount ||
                                            state.allowance >=
                                                parseFloat(state.amount)))
                                }
                            >
                                {state.loading
                                    ? "Loading..."
                                    : state.approved
                                    ? "Bridge Now"
                                    : "Approve Tokens"}
                            </Button>
                        </div>

                        {/* Transaction Link */}
                        {state.txHash && (
                            <div
                                style={{
                                    marginTop: "1.5rem",
                                    textAlign: "center",
                                }}
                            >
                                <a
                                    href={`https://ccip.chain.link/address/${state.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        color: "#7cf8cb",
                                        textDecoration: "none",
                                        fontSize: "0.875rem",
                                    }}
                                >
                                    View on Explorer ↗
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Index;
