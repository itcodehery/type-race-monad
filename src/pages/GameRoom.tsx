import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useGameContract, useWallet } from "../context/WalletContext";
import { ethers } from "ethers";

type GameState = "waiting" | "active" | "finished";

interface GameInfo {
  player1: string;
  player2: string;
  stakeAmount: bigint;
  textToType: string;
  startTime: bigint;
  endTime: bigint;
  gameActive: boolean;
  gameFinished: boolean;
  winner: string;
  player1Ready: boolean;
  player2Ready: boolean;
}

const GameRoom: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const gameContract = useGameContract();
  const { address } = useWallet();
  const navigate = useNavigate();

  const [gameState, setGameState] = useState<GameState>("waiting");
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [gameText, setGameText] = useState<string>("");
  const [userText, setUserText] = useState<string>("");
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0);
  const [words, setWords] = useState<string[]>([]);
  const [timer, setTimer] = useState<number>(60);
  const [isActive, setIsActive] = useState<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // State for WPM and accuracy calculation and results
  const [startTime, setStartTime] = useState<number | null>(null);
  const [correctCharacters, setCorrectCharacters] = useState<number>(0);
  const [totalCharacters, setTotalCharacters] = useState<number>(0);
  const [wpm, setWpm] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(100);
  const [scoreSubmitted, setScoreSubmitted] = useState<boolean>(false);
  const [gameResults, setGameResults] = useState<{
    winner: string;
    prize: string;
    player1Score: number;
    player2Score: number;
  } | null>(null);
  const [isFetchingResults, setIsFetchingResults] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [opponentScore, setOpponentScore] = useState<number>(0);

  // Memoize handleSubmitScore to prevent unnecessary re-renders
  const handleSubmitScore = useCallback(async () => {
    if (!gameContract || !gameId || !address || scoreSubmitted) return;

    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    try {
      const id = parseInt(gameId);
      if (isNaN(id)) {
        console.error("Invalid game ID for score submission");
        alert("Failed to submit score: Invalid game ID.");
        return;
      }

      const score = currentWordIndex;
      console.log(`Submitting score ${score} for game ${id}...`);
      const tx = await gameContract.submitScore(id, score);
      await tx.wait();

      console.log("Score submitted successfully!");
      setScoreSubmitted(true);
      setGameState("finished");
    } catch (error: any) {
      console.error("Error submitting score:", error);
      alert(`Failed to submit score: ${error.reason || error.message}`);
      setGameState("finished");
    }
  }, [gameContract, gameId, address, scoreSubmitted, currentWordIndex]);

  const handleCancelGame = async () => {
    if (
      !gameContract ||
      !gameId ||
      !address ||
      gameState !== "waiting" ||
      !gameInfo
    )
      return;

    if (gameInfo.player1.toLowerCase() !== address.toLowerCase()) {
      alert("Only the game creator can cancel the game.");
      return;
    }

    setIsCancelling(true);
    try {
      const id = parseInt(gameId);
      if (isNaN(id)) {
        console.error("Invalid game ID for cancellation");
        alert("Failed to cancel game: Invalid game ID.");
        return;
      }

      console.log(`Cancelling game ${id}...`);
      const tx = await gameContract.cancelGame(id);
      await tx.wait();

      console.log("Game cancelled successfully!");
      alert("Game cancelled.");
      navigate("/lobby");
    } catch (error: any) {
      console.error("Error cancelling game:", error);
      alert(`Failed to cancel game: ${error.reason || error.message}`);
    } finally {
      setIsCancelling(false);
    }
  };

  // Fetch game details when component mounts or gameContract is available
  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!gameContract || !gameId) return;

      try {
        const id = parseInt(gameId);
        if (isNaN(id)) {
          console.error("Invalid game ID");
          return;
        }

        const fetchedGameInfo: GameInfo = await gameContract.getGameInfo(id);
        setGameInfo(fetchedGameInfo);
        setGameText(fetchedGameInfo.textToType);
        setWords(fetchedGameInfo.textToType.split(" "));

        if (fetchedGameInfo.gameFinished) {
          setGameState("finished");
        } else if (fetchedGameInfo.gameActive) {
          if (fetchedGameInfo.startTime > 0) {
            const elapsed =
              Math.floor(Date.now() / 1000) - Number(fetchedGameInfo.startTime);
            const GAME_DURATION = 60;
            const remaining = GAME_DURATION - elapsed;
            setTimer(Math.max(0, remaining));
          } else {
            setTimer(60);
          }
          setGameState("active");
          setIsActive(true);
        } else if (fetchedGameInfo.player2 === ethers.ZeroAddress) {
          setGameState("waiting");
        } else if (
          fetchedGameInfo.player1Ready &&
          fetchedGameInfo.player2Ready
        ) {
          // Game is full and both are ready, but hasn't been marked active yet by contract
          setGameState("active");
          setIsActive(true);
          // Set start time if available, otherwise use current time (might be slight delay)
          setStartTime(
            Number(fetchedGameInfo.startTime) > 0
              ? Number(fetchedGameInfo.startTime)
              : Date.now() / 1000
          );
        } else {
          setGameState("waiting");
        }
      } catch (error) {
        console.error("Error fetching game details:", error);
      }
    };

    fetchGameDetails();
  }, [gameId, gameContract]);

  // Polling for game state updates when waiting
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout | null = null;

    if (gameState === "waiting" && gameContract && gameId) {
      pollingInterval = setInterval(async () => {
        try {
          const id = parseInt(gameId);
          const fetchedGameInfo: GameInfo = await gameContract.getGameInfo(id);
          setGameInfo(fetchedGameInfo);

          console.log(
            `Polling game ${id}. gameActive: ${fetchedGameInfo.gameActive}, gameFinished: ${fetchedGameInfo.gameFinished}, player2: ${fetchedGameInfo.player2}, p1Ready: ${fetchedGameInfo.player1Ready}, p2Ready: ${fetchedGameInfo.player2Ready}`
          );

          if (fetchedGameInfo.gameActive) {
            console.log(`Game ${id} is now active.`);
            setGameState("active");
            setIsActive(true);
            setStartTime(
              Number(fetchedGameInfo.startTime) > 0
                ? Number(fetchedGameInfo.startTime)
                : Date.now() / 1000
            );
            if (pollingInterval) clearInterval(pollingInterval);
          } else if (fetchedGameInfo.gameFinished) {
            console.log(`Game ${id} is finished while waiting.`);
            setGameState("finished");
            if (pollingInterval) clearInterval(pollingInterval);
          } else if (
            fetchedGameInfo.player1Ready &&
            fetchedGameInfo.player2Ready
          ) {
            // Game is full and both are ready, but hasn't been marked active yet by contract
            console.log(`Game ${id} is ready to start.`);
            setGameState("active");
            setIsActive(true);
            setStartTime(
              Number(fetchedGameInfo.startTime) > 0
                ? Number(fetchedGameInfo.startTime)
                : Date.now() / 1000
            );
            if (pollingInterval) clearInterval(pollingInterval);
          } else if (fetchedGameInfo.player2 !== ethers.ZeroAddress) {
            // Game is full but players are not ready yet, stay in waiting state but maybe show ready status
            console.log(`Game ${id} is full, waiting for players to be ready.`);
          }
        } catch (error) {
          console.error("Error polling for game updates:", error);
        }
      }, 5000);
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [gameState, gameContract, gameId]);

  // Polling for opponent's score during active game
  useEffect(() => {
    let scorePollingInterval: NodeJS.Timeout | null = null;

    if (
      gameState === "active" &&
      gameContract &&
      gameId &&
      address &&
      gameInfo &&
      gameInfo.gameActive
    ) {
      // Determine opponent's address
      const opponentAddress =
        gameInfo.player1.toLowerCase() === address.toLowerCase()
          ? gameInfo.player2
          : gameInfo.player1;

      if (opponentAddress && opponentAddress !== ethers.ZeroAddress) {
        // Capture variables for the interval scope
        const currentContract = gameContract;
        const currentId = parseInt(gameId);
        const currentOpponentAddress = opponentAddress;

        scorePollingInterval = setInterval(async () => {
          try {
            console.log(
              `Score polling interval: Current gameState is ${gameState}`
            );
            // Add an extra check to ensure we only poll if the game is still active
            // This handles potential race conditions where the interval might fire right after state changes
            if (gameState !== "active") {
              console.log(
                "Stopping opponent score polling: Game is no longer active."
              );
              // Optionally clear interval here if it wasn't cleared by effect cleanup
              // if (scorePollingInterval) clearInterval(scorePollingInterval);
              return;
            }

            const opponentScore = await currentContract.getPlayerScore(
              BigInt(currentId),
              currentOpponentAddress
            );
            setOpponentScore(Number(opponentScore));
          } catch (error) {
            console.error("Error polling for opponent score:", error);
          }
        }, 2000); // Poll opponent score every 2 seconds
      }
    }

    return () => {
      if (scorePollingInterval) {
        clearInterval(scorePollingInterval);
      }
    };
  }, [gameState, gameContract, gameId, address, gameInfo?.gameActive]);

  // Timer logic - FIXED: Removed handleSubmitScore from dependencies
  useEffect(() => {
    if (isActive && !scoreSubmitted) {
      intervalRef.current = setInterval(() => {
        setTimer((prevTimer) => {
          if (prevTimer <= 5) {
            setIsActive(false);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            // Call handleSubmitScore directly here instead of relying on dependency
            handleSubmitScore();
            setGameState("finished");
            return 0;
          }
          return prevTimer - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, scoreSubmitted]); // Removed handleSubmitScore from dependencies

  // Separate effect for WPM and accuracy calculation
  useEffect(() => {
    if (isActive && startTime !== null) {
      const calculationInterval = setInterval(() => {
        const elapsedSeconds = Date.now() / 1000 - startTime;
        if (elapsedSeconds > 0) {
          const calculatedWpm = (correctCharacters / 5 / elapsedSeconds) * 60;
          setWpm(Math.round(calculatedWpm));
          const calculatedAccuracy =
            totalCharacters > 0
              ? (correctCharacters / totalCharacters) * 100
              : 100;
          setAccuracy(Math.round(calculatedAccuracy));
        }
      }, 1000);

      return () => clearInterval(calculationInterval);
    }
  }, [isActive, startTime, correctCharacters, totalCharacters]);

  // Fetch game results when game state becomes finished
  useEffect(() => {
    const fetchGameResults = async () => {
      if (gameState === "finished" && gameContract && gameId && gameInfo) {
        setIsFetchingResults(true);
        try {
          const id = parseInt(gameId);
          const player1Score = await gameContract.getPlayerScore(
            BigInt(id),
            gameInfo.player1
          );
          const player2Score = await gameContract.getPlayerScore(
            BigInt(id),
            gameInfo.player2
          );
          const prizeAmount = ethers.formatEther(
            gameInfo.stakeAmount * BigInt(2)
          );
          console.log("Fetched gameInfo.winner:", gameInfo.winner);
          setGameResults({
            winner: gameInfo.winner,
            prize: prizeAmount,
            player1Score: Number(player1Score),
            player2Score: Number(player2Score),
          });
        } catch (error: any) {
          console.error("Error fetching game results:", error);
          // Log the specific error reason if available
          console.error("Error reason:", error.reason || error.message);
          setGameResults({
            winner: "Unknown",
            prize: "Unknown",
            player1Score: 0,
            player2Score: 0,
          });
        } finally {
          setIsFetchingResults(false);
        }
      }
    };

    fetchGameResults();
  }, [gameState, gameContract, gameId, gameInfo]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isActive || scoreSubmitted) return;

    const value = e.target.value;
    const currentWord = words[currentWordIndex];
    const typedCharacter = value[value.length - 1];

    // Start timer on first character typed if game is active
    if (totalCharacters === 0 && startTime === null && isActive) {
      setStartTime(Date.now() / 1000);
    }

    // Update total characters typed and correct characters based on current word and input
    let currentTotalCharacters = 0;
    let currentCorrectCharacters = 0;

    const previouslyTypedCorrect =
      words.slice(0, currentWordIndex).join(" ") +
      (currentWordIndex > 0 ? " " : "");
    const currentInput = value;
    const combinedTyped = previouslyTypedCorrect + currentInput;

    currentTotalCharacters = combinedTyped.length;

    // Compare typed characters with game text up to the current input length
    for (let i = 0; i < currentTotalCharacters; i++) {
      if (i < gameText.length) {
        if (combinedTyped[i] === gameText[i]) {
          currentCorrectCharacters++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    setTotalCharacters(currentTotalCharacters);
    setCorrectCharacters(currentCorrectCharacters);
    setUserText(value);

    // Word completion logic (when space is typed)
    if (typedCharacter === " ") {
      const typedWord = value.trim();
      if (typedWord === currentWord) {
        setCurrentWordIndex((prevIndex) => prevIndex + 1);
        setUserText("");

        if (currentWordIndex + 1 >= words.length) {
          setIsActive(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          if (!scoreSubmitted) {
            handleSubmitScore();
          }
          setGameState("finished");
        }
      }
    }
  };

  const handleSignalReady = async () => {
    if (!gameContract || !gameId || !address || !gameInfo) return;

    try {
      const id = parseInt(gameId);
      if (isNaN(id)) {
        console.error("Invalid game ID for signaling ready");
        alert("Failed to signal ready: Invalid game ID.");
        return;
      }

      // Prevent signaling ready if already ready
      if (
        (address.toLowerCase() === gameInfo.player1.toLowerCase() &&
          gameInfo.player1Ready) ||
        (address.toLowerCase() === gameInfo.player2.toLowerCase() &&
          gameInfo.player2Ready)
      ) {
        console.log("Already signaled ready.");
        return;
      }

      console.log(`Signaling ready for game ${id}...`);
      const tx = await gameContract.signalReady(id);
      await tx.wait();

      console.log("Signaled ready successfully!");
    } catch (error: any) {
      console.error("Error signaling ready:", error);
      alert(`Failed to signal ready: ${error.reason || error.message}`);
    }
  };

  // Helper to render game text with highlighting
  const renderGameText = useMemo(() => {
    return words.map((word, wordIndex) => {
      const wordSpan = word.split("").map((char, charIndex) => {
        const absoluteCharIndex =
          words.slice(0, wordIndex).join(" ").length +
          (wordIndex > 0 ? 1 : 0) +
          charIndex;

        const isCurrent =
          absoluteCharIndex === totalCharacters && gameState === "active";
        const isTyped = absoluteCharIndex < totalCharacters;
        const isCorrectlyTyped =
          isTyped && gameText[absoluteCharIndex] === char;
        const isIncorrectlyTyped =
          isTyped && gameText[absoluteCharIndex] !== char;

        const charClassName = `
          ${isCurrent ? "underline text-cyan-400" : ""}
          ${isIncorrectlyTyped ? "text-red-500" : ""}
          ${isCorrectlyTyped ? "text-green-500" : ""}
        `;

        return (
          <span key={absoluteCharIndex} className={charClassName}>
            {char}
          </span>
        );
      });

      if (wordIndex < words.length - 1) {
        const spaceAbsoluteIndex =
          words.slice(0, wordIndex + 1).join(" ").length - 1;
        const isSpaceCurrent =
          spaceAbsoluteIndex === totalCharacters && gameState === "active";
        const isSpaceTyped = spaceAbsoluteIndex < totalCharacters;
        const isSpaceCorrectlyTyped =
          isSpaceTyped && gameText[spaceAbsoluteIndex] === " ";
        const isSpaceIncorrectlyTyped =
          isSpaceTyped && gameText[spaceAbsoluteIndex] !== " ";

        const spaceClassName = `
          ${isSpaceCurrent ? "underline text-cyan-400" : ""}
          ${isSpaceIncorrectlyTyped ? "text-red-500" : ""}
          ${isSpaceCorrectlyTyped ? "text-green-500" : ""}
        `;

        wordSpan.push(
          <span key={`space-${wordIndex}`} className={spaceClassName}>
            {" "}
          </span>
        );
      }

      return <span key={wordIndex}>{wordSpan}</span>;
    });
  }, [gameText, words, totalCharacters, gameState]);

  // Render based on game state
  const renderGameContent = () => {
    switch (gameState) {
      case "waiting":
        return (
          <section className="bg-gray-800 p-6 rounded-lg shadow-xl mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              Waiting for Opponent...
            </h2>
            <p className="mb-4">Share game link: {window.location.href}</p>
            {gameInfo && gameInfo.player2 !== ethers.ZeroAddress && (
              <p className="text-xl font-semibold text-center mb-4">
                Opponent Joined!
              </p>
            )}
            {gameInfo && gameInfo.player2 !== ethers.ZeroAddress && (
              <div className="flex justify-center space-x-8 mb-4 text-xl">
                <p>
                  Your Status:{" "}
                  {address?.toLowerCase() === gameInfo.player1.toLowerCase()
                    ? gameInfo.player1Ready
                      ? "Ready"
                      : "Not Ready"
                    : gameInfo.player2Ready
                    ? "Ready"
                    : "Not Ready"}
                </p>
                <p>
                  Opponent Status:{" "}
                  {address?.toLowerCase() === gameInfo.player1.toLowerCase()
                    ? gameInfo.player2Ready
                      ? "Ready"
                      : "Not Ready"
                    : gameInfo.player1Ready
                    ? "Ready"
                    : "Not Ready"}
                </p>
              </div>
            )}
            {gameInfo &&
              gameInfo.player2 !== ethers.ZeroAddress &&
              !(
                (address?.toLowerCase() === gameInfo.player1.toLowerCase() &&
                  gameInfo.player1Ready) ||
                (address?.toLowerCase() === gameInfo.player2.toLowerCase() &&
                  gameInfo.player2Ready)
              ) && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={handleSignalReady}
                    className="px-8 py-4 text-lg font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105"
                  >
                    I'm Ready!
                  </button>
                </div>
              )}
            {gameInfo && gameInfo.player1Ready && gameInfo.player2Ready && (
              <p className="text-xl font-semibold text-center text-green-500">
                Both players are ready. Starting game soon...
              </p>
            )}
            {address &&
              gameContract &&
              gameId &&
              gameState === "waiting" &&
              gameInfo?.player1.toLowerCase() === address?.toLowerCase() && (
                <button
                  onClick={handleCancelGame}
                  className={`mt-4 px-4 py-2 rounded-md transition duration-300 ${
                    isCancelling
                      ? "bg-gray-500 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelling..." : "Cancel Game"}
                </button>
              )}
          </section>
        );
      case "active":
        return (
          <section className="bg-gray-800 p-6 rounded-lg shadow-xl mb-8">
            <h2 className="text-2xl font-semibold mb-4">Active Game</h2>
            <p className="text-xl mb-4">Time Remaining: {timer}s</p>
            <div className="text-lg mb-4 leading-relaxed">{renderGameText}</div>

            <input
              type="text"
              className="w-full p-4 rounded-md bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={userText}
              onChange={handleTyping}
              disabled={!isActive}
              autoFocus
            />

            <div className="mt-4 text-xl flex justify-between">
              <p>Your WPM: {wpm}</p>
              <p>Your Accuracy: {accuracy.toFixed(2)}%</p>
              {gameInfo && gameInfo.player2 !== ethers.ZeroAddress && (
                <p>Opponent Words: {opponentScore}</p>
              )}
            </div>
          </section>
        );
      case "finished":
        return (
          <section className="bg-gray-800 p-6 rounded-lg shadow-xl">
            <h2 className="text-2xl font-semibold mb-4">Game Finished!</h2>
            {isFetchingResults ? (
              <p>Fetching game results...</p>
            ) : gameResults && gameInfo ? (
              <div>
                <p className="text-xl mb-2">
                  Winner:{" "}
                  {gameResults.winner === ethers.ZeroAddress
                    ? "Undetermined"
                    : gameResults.winner}
                </p>
                <p className="text-xl mb-4">Prize: {gameResults.prize} MON</p>
                <div className="mt-4">
                  <h3 className="text-xl font-semibold mb-2">Scores:</h3>
                  {address &&
                    gameInfo.player1 !== ethers.ZeroAddress &&
                    gameInfo.player2 !== ethers.ZeroAddress && (
                      <p>
                        {gameInfo.player1.toLowerCase() ===
                        address?.toLowerCase()
                          ? "Your"
                          : "Opponent"}{" "}
                        Score:{" "}
                        {gameInfo.player1.toLowerCase() ===
                        address?.toLowerCase()
                          ? gameResults.player1Score
                          : gameResults.player2Score}{" "}
                        words
                      </p>
                    )}
                  {address &&
                    gameInfo.player1 !== ethers.ZeroAddress &&
                    gameInfo.player2 !== ethers.ZeroAddress && (
                      <p>
                        {gameInfo.player1.toLowerCase() ===
                        address?.toLowerCase()
                          ? "Opponent"
                          : "Your"}{" "}
                        Score:{" "}
                        {gameInfo.player1.toLowerCase() ===
                        address?.toLowerCase()
                          ? gameResults.player2Score
                          : gameResults.player1Score}{" "}
                        words
                      </p>
                    )}
                  {(gameInfo.player1 === ethers.ZeroAddress ||
                    gameInfo.player2 === ethers.ZeroAddress ||
                    gameResults.winner === ethers.ZeroAddress) && (
                    <div>
                      {gameInfo.player1 !== ethers.ZeroAddress && (
                        <p>
                          Player 1 Score ({gameInfo.player1.slice(0, 6)}...):{" "}
                          {gameResults?.player1Score} words
                        </p>
                      )}
                      {gameInfo.player2 !== ethers.ZeroAddress && (
                        <p>
                          Player 2 Score ({gameInfo.player2.slice(0, 6)}...):{" "}
                          {gameResults?.player2Score} words
                        </p>
                      )}
                      {gameInfo.player1 === ethers.ZeroAddress &&
                        gameInfo.player2 === ethers.ZeroAddress && (
                          <p>Waiting for players...</p>
                        )}
                    </div>
                  )}
                </div>
                <h3 className="text-xl font-semibold mt-4 mb-2">
                  Your Final Performance:
                </h3>
                <p>Final WPM: {wpm}</p>
                <p>Final Accuracy: {accuracy.toFixed(2)}%</p>
              </div>
            ) : (
              <p>Game results not available.</p>
            )}
            <div className="mt-6">
              <Link
                to="/lobby"
                className="px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Back to Lobby
              </Link>
            </div>
          </section>
        );
      default:
        return <p>Loading game state...</p>;
    }
  };

  return (
    <div className="container mx-auto p-4 mt-8 text-white">
      <h1 className="text-4xl font-bold text-center mb-8">
        Game Room: {gameId}
      </h1>
      {renderGameContent()}
    </div>
  );
};

export default GameRoom;
