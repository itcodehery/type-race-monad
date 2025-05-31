import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useGameContract, useWallet } from "../context/WalletContext";
import { ethers } from "ethers";

// Define a type for game data based on your contract's getGameInfo output
interface Game {
  gameId: number;
  player1: string;
  player2: string;
  stakeAmount: string; // Use string to handle large numbers
  textToType: string;
  startTime: number;
  endTime: number;
  gameActive: boolean;
  gameFinished: boolean;
  winner: string;
}

const GameLobby: React.FC = () => {
  const gameContract = useGameContract();
  const { address } = useWallet(); // Get user's address
  const [availableGames, setAvailableGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState<number | null>(null); // Track which game is being joined
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Function to fetch games from the contract
  const fetchGames = async () => {
    if (!gameContract) {
      setIsLoading(false);
      setError("Wallet not connected or contract not available.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const totalGamesBigInt = await gameContract.getTotalGames();
      // Convert BigInt to number for comparison and iteration
      const totalGames = Number(totalGamesBigInt); // Correct conversion for native BigInt

      const games: Game[] = [];
      console.log("Number of games (gameCounter): " + totalGames);
      // Fetch details for a reasonable number of recent games, e.g., last 20
      // We need to iterate from the most recently created game ID downwards
      const gamesToFetch = Math.min(totalGames, 20);
      console.log("Games to attempt fetching: " + gamesToFetch);

      // Iterate backwards from the highest possible game ID (totalGames - 1) down to 0
      // Limit the iteration to the number of games we want to fetch
      for (let i = 0; i < gamesToFetch; i++) {
        const gameId = totalGames - 1 - i; // Calculate the game ID correctly

        console.log(`Attempting to fetch game ID: ${gameId}`); // Log the game ID being fetched

        // Check if gameId is valid (>= 0) - contract uses 0-based or 1-based, but counter is total
        // The gameExists check in contract should handle 0 if applicable
        if (gameId >= 0) {
          // Ensure we don't go below 0
          try {
            const gameInfo = await gameContract.getGameInfo(gameId);
            // Convert BigInt stakeAmount to string for display
            const stakeAmountFormatted = ethers.formatEther(
              gameInfo.stakeAmount
            );

            // Only add games that are not finished and are waiting for a second player
            // Also exclude games where the current user is player1 (they are in GameRoom)
            if (
              !gameInfo.gameFinished &&
              gameInfo.player2 === ethers.ZeroAddress &&
              gameInfo.player1.toLowerCase() !== address?.toLowerCase()
            ) {
              games.push({
                gameId: gameId,
                player1: gameInfo.player1, // Assuming addresses are strings
                player2: gameInfo.player2, // Assuming addresses are strings
                stakeAmount: stakeAmountFormatted,
                textToType: gameInfo.textToType, // Consider truncating for lobby display
                startTime: Number(gameInfo.startTime), // Convert BigInt to number
                endTime: Number(gameInfo.endTime), // Convert BigInt to number
                gameActive: gameInfo.gameActive,
                gameFinished: gameInfo.gameFinished,
                winner: gameInfo.winner, // Assuming winner address is a string
              });
            }
          } catch (innerError: any) {
            console.error(
              `Error fetching game ${gameId}: ${
                innerError.reason || innerError.message
              }`,
              innerError
            );
            // Continue fetching other games even if one fails
          }
        }
      }
      // Sort games by ID in ascending order before setting state to show oldest first
      games.sort((a, b) => a.gameId - b.gameId);
      setAvailableGames(games);
    } catch (err: any) {
      console.error("Error fetching games overall:", err);
      setError(`Failed to fetch games: ${err.reason || err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch when component mounts or gameContract is available
  useEffect(() => {
    fetchGames();
  }, [gameContract, address]); // Also refetch if address changes (user connects/disconnects)

  // Polling effect to refresh game list periodically
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout | null = null;

    if (gameContract) {
      // Only poll if contract is available
      pollingInterval = setInterval(() => {
        console.log("Polling for new games...");
        fetchGames();
      }, 15000); // Poll every 15 seconds
    }

    // Cleanup function to clear the interval
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [gameContract, address]); // Re-establish polling if contract or address changes

  const handleJoinGame = async (gameId: number, stakeAmount: string) => {
    if (!gameContract) {
      alert("Wallet not connected or contract not available.");
      return;
    }
    if (!address) {
      alert("Please connect your wallet.");
      return;
    }

    setIsJoining(gameId);
    try {
      const amountInWei = ethers.parseEther(stakeAmount);
      const tx = await gameContract.joinGame(gameId, { value: amountInWei });
      await tx.wait();

      alert(`Successfully joined game ${gameId}!`);
      navigate(`/game/${gameId}`);
    } catch (error: any) {
      console.error("Error joining game:", error);
      alert(`Failed to join game: ${error.reason || error.message}`);
    } finally {
      setIsJoining(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 mt-12 text-white font-sans">
      <h1 className="text-5xl font-extrabold text-center mb-12 tracking-tight drop-shadow-lg">
        Game Lobby
      </h1>

      {/* Create New Game Section */}
      <section className="bg-gray-900 p-10 rounded-xl shadow-2xl mb-12 border border-blue-600/30 transform hover:scale-[1.01] transition-transform duration-300 ease-in-out">
        <h2 className="text-3xl font-bold mb-6 text-blue-400">
          Create New Game
        </h2>
        <p className="mb-4">Ready to challenge someone? Create a new game!</p>
        <Link
          to="/create"
          className="inline-block px-10 py-5 text-xl font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-700 rounded-full shadow-lg hover:shadow-xl hover:from-purple-700 hover:to-indigo-800 transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-purple-500 focus:ring-opacity-50"
        >
          Create Game
        </Link>
      </section>

      {/* Available Games Section */}
      <section className="bg-gray-900 p-10 rounded-xl shadow-2xl mb-12 border border-green-600/30 transform hover:scale-[1.01] transition-transform duration-300 ease-in-out">
        <h2 className="text-3xl font-bold mb-6 text-green-400">
          Available Games
        </h2>
        {isLoading && <p>Loading games...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {!isLoading && availableGames.length === 0 && (
          <p>No available games found.</p>
        )}

        {!isLoading && availableGames.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {availableGames.map((game) => (
              <div
                key={game.gameId}
                className="bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700 hover:border-blue-500 transition-all duration-300 ease-in-out transform hover:-translate-y-1 hover:scale-[1.02] flex flex-col"
              >
                <h3 className="text-2xl font-bold mb-3 text-blue-300">
                  Game #{game.gameId}
                </h3>
                <p className="text-gray-300 mb-2 text-lg">
                  Stake:{" "}
                  <span className="font-mono text-yellow-400">
                    {game.stakeAmount} MON
                  </span>
                </p>
                <p className="truncate text-gray-400 mb-4">
                  Text Preview: {game.textToType.substring(0, 50)}...
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Players: {game.player1.slice(0, 6)}... /{" "}
                  {game.player2 !== ethers.ZeroAddress
                    ? game.player2.slice(0, 6) + "..."
                    : "Waiting..."}
                </p>
                {/* Only show Join Game button if game is waiting for a player AND current user is not player1 */}
                {game.player2 === ethers.ZeroAddress &&
                  address?.toLowerCase() !== game.player1.toLowerCase() && (
                    <button
                      onClick={() =>
                        handleJoinGame(game.gameId, game.stakeAmount)
                      }
                      className={`mt-auto inline-block px-6 py-3 text-md font-semibold text-white rounded-lg shadow transition duration-300 ease-in-out ${
                        isJoining === game.gameId
                          ? "bg-gray-500 cursor-not-allowed"
                          : "bg-green-600 hover:bg-green-700 transform hover:scale-105"
                      }`}
                      disabled={isJoining === game.gameId}
                    >
                      {isJoining === game.gameId ? "Joining..." : "Join Game"}
                    </button>
                  )}
                {/* Show View Game link if the game is full (has a player2) or if current user is player1 (and game is waiting) */}
                {(game.player2 !== ethers.ZeroAddress ||
                  (game.player1.toLowerCase() === address?.toLowerCase() &&
                    game.player2 === ethers.ZeroAddress)) && (
                  <Link
                    to={`/game/${game.gameId}`}
                    className="mt-auto inline-block px-6 py-3 text-md font-semibold text-white bg-blue-600 rounded-lg shadow hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
                  >
                    View Game
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My Active Games Section */}
      <section className="bg-gray-900 p-10 rounded-xl shadow-2xl border border-yellow-600/30 transform hover:scale-[1.01] transition-transform duration-300 ease-in-out">
        <h2 className="text-3xl font-bold mb-6 text-yellow-400">
          My Active Games
        </h2>
        <p className="text-gray-400 text-lg">
          Your active games will appear here once implemented.
        </p>
      </section>
    </div>
  );
};

export default GameLobby;
