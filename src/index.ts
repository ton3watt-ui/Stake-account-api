import express, { Express, Request, Response } from 'express';
import * as web3 from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
app.use(express.json());

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

const connection = new web3.Connection(RPC_ENDPOINT, 'confirmed');

// Helper function to get keypair from private key
function getKeypair(): web3.Keypair {
  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in environment variables');
  }
  const secretKey = JSON.parse(PRIVATE_KEY);
  return web3.Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// GET /stake-account/:address - Get stake account details
app.get('/stake-account/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const stakeAddress = new web3.PublicKey(address);
    
    const stakeAccount = await connection.getAccountInfo(stakeAddress);
    if (!stakeAccount) {
      return res.status(404).json({ error: 'Stake account not found' });
    }

    const stakeInfo = web3.StakeProgram.decode(stakeAccount);
    
    res.json({
      address,
      balance: stakeAccount.lamports,
      balanceInSOL: stakeAccount.lamports / web3.LAMPORTS_PER_SOL,
      stakeInfo
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /deactivate - Deactivate stake account
app.post('/deactivate', async (req: Request, res: Response) => {
  try {
    const { stakeAccount } = req.body;
    
    if (!stakeAccount) {
      return res.status(400).json({ error: 'stakeAccount address required' });
    }

    const keypair = getKeypair();
    const stakeAddress = new web3.PublicKey(stakeAccount);
    const authorizedAddress = keypair.publicKey;

    const deactivateTransaction = new web3.Transaction().add(
      web3.StakeProgram.deactivate({
        stakePubkey: stakeAddress,
        authorizedPubkey: authorizedAddress,
      })
    );

    const signature = await web3.sendAndConfirmTransaction(
      connection,
      deactivateTransaction,
      [keypair]
    );

    res.json({
      success: true,
      message: 'Deactivation initiated',
      transactionHash: signature,
      stakeAccount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /withdraw - Withdraw SOL to recipient
app.post('/withdraw', async (req: Request, res: Response) => {
  try {
    const { stakeAccount, recipient, amount } = req.body;

    if (!stakeAccount || !recipient) {
      return res.status(400).json({ 
        error: 'stakeAccount and recipient addresses required' 
      });
    }

    const keypair = getKeypair();
    const stakeAddress = new web3.PublicKey(stakeAccount);
    const recipientAddress = new web3.PublicKey(recipient);
    const authorizedAddress = keypair.publicKey;

    // Withdraw all funds
    const withdrawTransaction = new web3.Transaction().add(
      web3.StakeProgram.withdraw({
        stakePubkey: stakeAddress,
        authorizedPubkey: authorizedAddress,
        toPubkey: recipientAddress,
        lamports: amount === 'all' ? await connection.getBalance(stakeAddress) : parseInt(amount)
      })
    );

    const signature = await web3.sendAndConfirmTransaction(
      connection,
      withdrawTransaction,
      [keypair]
    );

    res.json({
      success: true,
      message: 'Withdrawal completed',
      transactionHash: signature,
      stakeAccount,
      recipient
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /status/:address - Monitor deactivation status
app.get('/status/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const stakeAddress = new web3.PublicKey(address);
    
    const stakeAccount = await connection.getAccountInfo(stakeAddress);
    if (!stakeAccount) {
      return res.status(404).json({ error: 'Stake account not found' });
    }

    const stakeInfo = web3.StakeProgram.decode(stakeAccount);
    
    res.json({
      address,
      state: stakeInfo.type,
      balance: stakeAccount.lamports,
      balanceInSOL: stakeAccount.lamports / web3.LAMPORTS_PER_SOL,
      deactivationEpoch: stakeInfo.stake?.deactivationEpoch || null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Stake Account API running on port ${PORT}`);
});