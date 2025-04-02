const express = require('express');
const WebSocket = require('ws');
const admin = require('firebase-admin');
const app = express();
const port = process.env.PORT || 3003;

// Khởi tạo Firebase với biến môi trường
let serviceAccount;
if (process.env.FIREBASE_ADMINSDK) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_ADMINSDK);
    } catch (error) {
        console.error('Error parsing FIREBASE_ADMINSDK:', error);
        throw new Error('Invalid FIREBASE_ADMINSDK environment variable');
    }
} else {
    console.log('FIREBASE_ADMINSDK not found, falling back to local file');
    serviceAccount = require('../gjchain/firebase-adminsdk.json');
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const blockchainCollection = admin.firestore().collection('gjchain');
const walletsCollection = admin.firestore().collection('wallets');

app.use(express.json());
app.use(express.static('public'));

class Block {
    constructor(index, timestamp, data, previousHash = '', miner) {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.miner = miner;
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        return require('crypto').createHash('sha256').update(
            this.index + this.timestamp + JSON.stringify(this.data) + this.previousHash + this.miner + this.nonce
        ).digest('hex');
    }

    mineBlock(difficulty) {
        const target = '0'.repeat(difficulty);
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
    }
}

const difficulty = 4;
const miningReward = 10;

async function mine(minerAddress) {
    const snapshot = await blockchainCollection.orderBy('index').get();
    const chain = snapshot.docs.map(doc => Object.assign(new Block(), doc.data()));
    const latestBlock = chain[chain.length - 1];
    const pendingSnapshot = await blockchainCollection.doc('pending').get();
    const pendingTransactions = pendingSnapshot.exists ? pendingSnapshot.data().transactions : [];

    const block = new Block(chain.length, new Date().toISOString(), pendingTransactions, latestBlock.hash, minerAddress);
    block.mineBlock(difficulty);

    for (const tx of pendingTransactions) {
        await walletsCollection.doc(tx.from).update({ balance: admin.firestore.FieldValue.increment(-tx.amount) });
        await walletsCollection.doc(tx.to).update({ balance: admin.firestore.FieldValue.increment(tx.amount) }, { merge: true });
    }
    await walletsCollection.doc(minerAddress).update({ balance: admin.firestore.FieldValue.increment(miningReward) }, { merge: true });

    await blockchainCollection.doc(block.index.toString()).set({ ...block });
    await blockchainCollection.doc('pending').set({ transactions: [] });
    return block;
}

app.post('/mine', async (req, res) => {
    const { minerAddress } = req.body;
    const block = await mine(minerAddress);
    res.json(block);
});

const wss = new WebSocket.Server({ port: parseInt(port, 10) + 1 }); // Sửa lỗi cổng
wss.on('connection', ws => {
    ws.on('message', async message => {
        const data = JSON.parse(message);
        if (data.type === 'block') {
            const block = Object.assign(new Block(), data.data);
            await blockchainCollection.doc(block.index.toString()).set({ ...block });
        }
    });
});

app.listen(port, () => console.log(`Mining Node chạy tại http://localhost:${port}`));
