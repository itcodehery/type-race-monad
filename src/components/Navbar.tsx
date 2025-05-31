import React from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';

const Navbar: React.FC = () => {
  const { isConnected } = useWallet();

  // Only render the navbar if the wallet is connected
  if (!isConnected) {
    return null;
  }

  return (
    <nav className="bg-gray-900 text-white p-4 shadow-lg">
      <div className="container mx-auto flex justify-between items-center">
        {/* Logo or App Title */}
        <Link to="/lobby" className="text-2xl font-bold text-cyan-400 hover:text-cyan-300 transition duration-300">
          TypeRace Monad
        </Link>

        {/* Navigation Links */}
        <div className="space-x-4">
          <Link
            to="/lobby"
            className="text-lg hover:text-cyan-400 transition duration-300"
          >
            Lobby
          </Link>
          <Link
            to="/history"
            className="text-lg hover:text-cyan-400 transition duration-300"
          >
            History
          </Link>
          <Link
            to="/profile"
            className="text-lg hover:text-cyan-400 transition duration-300"
          >
            Profile
          </Link>
        </div>

        {/* Wallet Status (Optional, could be in a separate component) */}
        {/* <p>{address ? `Connected: ${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}</p> */}

      </div>
    </nav>
  );
};

export default Navbar; 