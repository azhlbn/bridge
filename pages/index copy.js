import "semantic-ui-css/semantic.min.css";
import React, { useState, useEffect, useCallback } from "react";
import { Button, Form, Icon } from "semantic-ui-react";
import { ethers } from "ethers"; // Импорт без изменений
import { CCIP_BnM_Address, routerConfig, routerABI } from "./ccipConfig";
import Link from "next/link";
import Image from "next/image";

const backgroundStyle = {
    background: "linear-gradient(135deg, #0F1419 0%, #1A2129 100%)",
    minHeight: "100vh",
    padding: "40px 20px",
    color: "#E2E8F0",
    fontFamily: "'Inter', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const cardStyle = {
    background: "rgba(26, 33, 41, 0.95)",
    borderRadius: "24px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    padding: "2.5rem",
    width: "100%",
    maxWidth: "480px",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
    backdropFilter: "blur(12px)",
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
        showExternalLink: false,
        transactionConfirmed: false,
    });

    const getBalance = useCallback(async () => {
        if (!state.address) return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum); // Обновлено для v6
            const tokenContract = new ethers.Contract(
                state.tokenAddress,
                ["function balanceOf(address owner) view returns (uint256)"],
                provider
            );
            const balance = await tokenContract.balanceOf(state.address);
            console.log("Raw balance:", balance.toString());
            const formattedBalance = parseFloat(ethers.formatEther(balance)); // Обновлено для v6
            setState((prev) => ({
                ...prev,
                balance: formattedBalance,
            }));
            console.log("Formatted balance:", formattedBalance);
        } catch (error) {
            console.error("Balance check failed:", error);
        }
    }, [state.address, state.tokenAddress]);

    // Обновим connectWallet для v6
    const connectWallet = async () => {
        try {
            const { ethereum } = window;
            if (!ethereum) throw new Error("MetaMask not installed");

            const accounts = await ethereum.request({
                method: "eth_requestAccounts",
            });
            console.log("Connected account:", accounts[0]);
            setState((prev) => ({
                ...prev,
                address: accounts[0],
            }));
        } catch (error) {
            console.error("Wallet connection failed:", error);
        }
    };

    const checkNetwork = useCallback(async () => {
        if (window.ethereum) {
            try {
                const chainId = await window.ethereum.request({
                    method: "eth_chainId",
                });
                const astarChainId = "0x250";
                console.log("Current chainId:", chainId);
                if (chainId !== astarChainId) {
                    return "Please switch to the Astar network.";
                }
                return null;
            } catch (error) {
                console.error("Error checking network:", error);
                return "Error checking network. Please try again.";
            }
        } else {
            return "Please install MetaMask to interact with this application.";
        }
    }, []);

    useEffect(() => {
        const checkAndUpdate = async () => {
            const networkError = await checkNetwork();
            if (networkError) {
                setState((prev) => ({ ...prev, networkError }));
            } else {
                setState((prev) => ({ ...prev, networkError: null }));
                if (state.address) {
                    console.log("Fetching balance for:", state.address);
                    await getBalance();
                }
            }
        };
        checkAndUpdate();

        if (window.ethereum) {
            window.ethereum.on("chainChanged", checkAndUpdate);
            window.ethereum.on("accountsChanged", (accounts) => {
                console.log("Accounts changed:", accounts);
                setState((prev) => ({
                    ...prev,
                    address: accounts[0] || "",
                }));
            });
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener("chainChanged", checkAndUpdate);
                window.ethereum.removeListener("accountsChanged", () => {});
            }
        };
    }, [state.address, getBalance, checkNetwork]);

    const calculateFee = useCallback(async () => {
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
    }, [
        state.amount,
        state.address,
        state.sourceChain,
        state.destChain,
        state.tokenAddress,
    ]);

    const checkAllowance = useCallback(async () => {
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
    }, [state.address, state.amount, state.sourceChain, state.tokenAddress]);

    // Остальной код остаётся без изменений для краткости
    return (
        <div style={backgroundStyle}>
            <div style={cardStyle}>
                <Link href="/">
                    <a>
                        <Image
                            src="/images/logo.png"
                            alt="Algem Logo"
                            width={120}
                            height={36}
                            style={{
                                marginBottom: "2rem",
                                filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.2))",
                                cursor: "pointer",
                            }}
                        />
                    </a>
                </Link>

                {state.networkError && (
                    <div
                        style={{
                            background: "rgba(239, 68, 68, 0.1)",
                            color: "#FCA5A5",
                            padding: "1rem 1.5rem",
                            borderRadius: "12px",
                            border: "1px solid rgba(239, 68, 68, 0.2)",
                            marginBottom: "2rem",
                            textAlign: "center",
                            fontSize: "0.9rem",
                        }}
                    >
                        {state.networkError}
                    </div>
                )}

                <h1
                    style={{
                        fontSize: "1.5rem",
                        fontWeight: "600",
                        marginBottom: "2rem",
                        color: "#FFFFFF",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                    }}
                >
                    <Icon name="exchange" style={{ color: "#29FFB2" }} />
                    Bridge to Soneium
                </h1>

                <Button
                    fluid
                    onClick={connectWallet}
                    style={{
                        background: state.address
                            ? "rgba(255, 255, 255, 0.05)"
                            : "linear-gradient(90deg, #29FFB2 0%, #00DDEB 100%)",
                        color: state.address ? "#FFFFFF" : "#1A2129",
                        border: state.address
                            ? "1px solid rgba(255, 255, 255, 0.1)"
                            : "none",
                        borderRadius: "12px",
                        padding: "16px",
                        fontWeight: "600",
                        marginBottom: "2rem",
                    }}
                >
                    {state.address
                        ? `${state.address.slice(0, 6)}...${state.address.slice(
                              -4
                          )}`
                        : "Connect Wallet"}
                </Button>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "2rem",
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: "1rem",
                        borderRadius: "16px",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                >
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <Image
                            src="/images/astar_logo.png"
                            alt="Astar Logo"
                            width={32}
                            height={32}
                        />
                        <div
                            style={{
                                color: "#94A3B8",
                                fontSize: "0.8rem",
                                marginTop: "0.5rem",
                            }}
                        >
                            From
                        </div>
                        <div style={{ fontWeight: "600", color: "#FFFFFF" }}>
                            Astar
                        </div>
                    </div>
                    <Icon
                        name="long arrow alternate right"
                        style={{ color: "#29FFB2", margin: "0 1rem" }}
                    />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <Image
                            src="/images/soneium_logo.png"
                            alt="Soneium Logo"
                            width={32}
                            height={32}
                        />
                        <div
                            style={{
                                color: "#94A3B8",
                                fontSize: "0.8rem",
                                marginTop: "0.5rem",
                            }}
                        >
                            To
                        </div>
                        <div style={{ fontWeight: "600", color: "#FFFFFF" }}>
                            Soneium
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "1rem",
                        fontSize: "0.9rem",
                        color: "#94A3B8",
                    }}
                >
                    <span>Available Balance:</span>
                    <span style={{ color: "#FFFFFF" }}>
                        {state.balance.toFixed(4)} xnASTR
                    </span>
                </div>

                {/* Amount Input */}
                <div style={{ position: "relative", marginBottom: "1.5rem" }}>
                    <input
                        type="number"
                        placeholder="Enter amount"
                        value={state.amount}
                        onChange={(e) =>
                            setState((prev) => ({
                                ...prev,
                                amount: e.target.value,
                            }))
                        }
                        style={{
                            width: "100%",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "12px",
                            padding: "16px 60px 16px 16px",
                            fontSize: "1.1rem",
                            color: "#FFFFFF",
                            outline: "none",
                            transition: "all 0.3s ease",
                            "&:focus": {
                                borderColor: "#29FFB2",
                                boxShadow: "0 0 0 2px rgba(41, 255, 178, 0.2)",
                            },
                        }}
                    />
                    <button
                        style={{
                            position: "absolute",
                            right: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "rgba(41, 255, 178, 0.1)",
                            color: "#29FFB2",
                            border: "none",
                            borderRadius: "8px",
                            padding: "6px 12px",
                            fontSize: "0.9rem",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "all 0.3s ease",
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

                {/* Fee */}
                <div
                    style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: "1rem",
                        borderRadius: "12px",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        marginBottom: "2rem",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                        }}
                    >
                        <span style={{ color: "#94A3B8", fontSize: "0.9rem" }}>
                            Bridge Fee:
                        </span>
                        <span style={{ color: "#FFFFFF", fontSize: "0.9rem" }}>
                            {state.fee.toFixed(4)} ASTR
                        </span>
                    </div>
                </div>

                {/* Action Buttons */}
                <Button
                    loading={state.loading && !state.approved}
                    style={{
                        width: "100%",
                        background:
                            "linear-gradient(90deg, #29FFB2 0%, #00DDEB 100%)",
                        color: "#1A2129",
                        borderRadius: "12px",
                        padding: "16px",
                        fontWeight: "600",
                        fontSize: "1rem",
                        transition: "all 0.3s ease",
                        opacity:
                            state.loading || (!state.amount && !state.approved)
                                ? 0.6
                                : 1,
                        "&:hover": {
                            transform: "translateY(-2px)",
                            boxShadow: "0 4px 12px rgba(41, 255, 178, 0.3)",
                        },
                    }}
                    onClick={state.approved ? sendCrossChain : handleApprove}
                    disabled={
                        state.loading ||
                        (!state.approved &&
                            (!state.amount ||
                                state.allowance >= parseFloat(state.amount)))
                    }
                >
                    {state.loading
                        ? "Processing..."
                        : state.approved
                        ? "Bridge Now"
                        : "Approve Tokens"}
                </Button>

                {/* Transaction Link */}
                {state.txHash && (
                    <Button
                        onClick={() => {
                            window.open(
                                `https://ccip.chain.link/address/${state.address}`,
                                "_blank",
                                "noopener,noreferrer"
                            );
                        }}
                        style={{
                            width: "100%",
                            background: "transparent",
                            color: "#29FFB2",
                            border: "1px solid rgba(41, 255, 178, 0.3)",
                            borderRadius: "12px",
                            padding: "16px",
                            fontWeight: "600",
                            fontSize: "1rem",
                            marginTop: "1rem",
                            transition: "all 0.3s ease",
                            opacity: state.transactionConfirmed ? 1 : 0.5,
                            cursor: state.transactionConfirmed
                                ? "pointer"
                                : "not-allowed",
                            "&:hover": {
                                background: "rgba(41, 255, 178, 0.1)",
                            },
                        }}
                        disabled={!state.transactionConfirmed}
                    >
                        View Transaction ↗
                    </Button>
                )}
            </div>
        </div>
    );
};

export default Index;
