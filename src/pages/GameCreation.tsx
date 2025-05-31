import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameContract } from "../context/WalletContext";
import { ethers } from "ethers";

const GameCreation: React.FC = () => {
  const [textToType, setTextToType] = useState("");
  const [stakeAmount, setStakeAmount] = useState("0.1"); // Default stake
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const gameContract = useGameContract();

  const handleCreateGame = async () => {
    if (!gameContract) {
      alert("Wallet not connected or contract not available.");
      return;
    }
    if (!textToType.trim()) {
      alert("Please enter text to type.");
      return;
    }
    if (parseFloat(stakeAmount) <= 0) {
      alert("Stake amount must be greater than zero.");
      return;
    }

    setIsLoading(true);
    try {
      const amountInWei = ethers.parseEther(stakeAmount);
      console.log(
        `Creating game with stake: ${stakeAmount} MON and text: "${textToType.substring(
          0,
          50
        )}..."`
      );

      const tx = await gameContract.createGame(textToType, {
        value: amountInWei,
      });
      console.log("Transaction sent, waiting for confirmation...");
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

      const gameCreatedEvent = receipt?.logs?.find(
        (log: any) =>
          gameContract.interface.parseLog(log)?.name === "GameCreated"
      );

      if (gameCreatedEvent) {
        const parsedLog = gameContract.interface.parseLog(gameCreatedEvent);
        if (parsedLog) {
          const newGameId = parsedLog.args[0];
          console.log(
            `New game created successfully with ID: ${newGameId.toString()}`
          );
          alert(`Game created successfully! Game ID: ${newGameId.toString()}`);
          navigate(`/game/${newGameId.toString()}`);
        }
      } else {
        console.error("GameCreated event not found in transaction receipt.");
        alert("Game created, but could not retrieve game ID from event.");
        navigate("/lobby");
      }
    } catch (error: any) {
      console.error("Error creating game:", error);
      alert(`Failed to create game: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 mt-12 text-white font-sans">
      <h1 className="text-5xl font-extrabold text-center mb-12 tracking-tight drop-shadow-lg">
        Create New Game
      </h1>

      {/* Custom Paragraph Input */}
      <section className="bg-gray-900 p-10 rounded-xl shadow-2xl mb-12 border border-blue-600/30 transform hover:scale-[1.01] transition-transform duration-300 ease-in-out">
        <h2 className="text-3xl font-bold mb-6 text-blue-400">Typing Text</h2>
        <textarea
          className="w-full p-5 rounded-lg bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:border-transparent transition-all duration-300 ease-in-out text-lg"
          rows={10}
          placeholder="Enter your custom typing text here..."
          value={textToType}
          onChange={(e) => setTextToType(e.target.value)}
        ></textarea>
        {/* Placeholder for paragraph library selector */}
        {/* <button className="mt-4 px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700">Select from Library</button> */}
      </section>

      {/* Stake Amount Selection */}
      <section className="bg-gray-900 p-10 rounded-xl shadow-2xl mb-12 border border-green-600/30 transform hover:scale-[1.01] transition-transform duration-300 ease-in-out">
        <h2 className="text-3xl font-bold mb-6 text-green-400">
          Stake Amount (MON)
        </h2>
        <input
          type="number"
          step="0.01"
          className="w-1/3 p-4 rounded-lg bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-green-500 focus:border-transparent transition-all duration-300 ease-in-out text-lg"
          placeholder="e.g., 0.1"
          value={stakeAmount}
          onChange={(e) => setStakeAmount(e.target.value)}
        />
        {/* Stake presets */}
        <div className="mt-6 flex flex-wrap gap-4">
          <button
            className="px-6 py-3 bg-green-600 rounded-full hover:bg-green-700 text-white font-semibold shadow-md transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50"
            onClick={() => setStakeAmount("0.1")}
          >
            0.1 MON
          </button>
          <button
            className="px-6 py-3 bg-green-600 rounded-full hover:bg-green-700 text-white font-semibold shadow-md transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50"
            onClick={() => setStakeAmount("0.5")}
          >
            0.5 MON
          </button>
          <button
            className="px-6 py-3 bg-green-600 rounded-full hover:bg-green-700 text-white font-semibold shadow-md transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50"
            onClick={() => setStakeAmount("1")}
          >
            1 MON
          </button>
        </div>
      </section>

      {/* Game Preview and Create Button */}
      <section className="bg-gray-900 p-10 rounded-xl shadow-2xl border border-purple-600/30 transform hover:scale-[1.01] transition-transform duration-300 ease-in-out">
        <h2 className="text-3xl font-bold mb-6 text-purple-400">
          Game Preview
        </h2>
        <p className="mb-4 text-lg">
          Text Preview:{" "}
          <span className="text-gray-300 font-mono">
            {textToType.substring(0, 200)}...
          </span>
        </p>
        <p className="mb-6 text-lg">
          Stake Amount:{" "}
          <span className="text-yellow-400 font-semibold">
            {stakeAmount} MON
          </span>
        </p>
        <button
          className={`mt-6 px-10 py-5 text-xl font-bold text-white rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-purple-500 focus:ring-opacity-50 ${
            isLoading
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800"
          }`}
          onClick={handleCreateGame}
          disabled={isLoading}
        >
          {isLoading ? "Creating Game..." : "Create Game"}
        </button>
      </section>
    </div>
  );
};

export default GameCreation;
