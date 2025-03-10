import { ethers } from "ethers";

let provider;

if (typeof window !== "undefined" && typeof window.ethereum !== "undefined") {
  provider = new ethers.providers.Web3Provider(window.ethereum);
} else {
  provider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
  // provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
}

export default provider;
