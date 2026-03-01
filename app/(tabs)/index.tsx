import { StyleSheet, TouchableOpacity, View, Modal, TextInput, ScrollView, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { HDKey } from '@scure/bip32';
import CryptoJS from 'crypto-js';
import { Buffer } from 'buffer';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import { statusBarHeight } from '@/constants/theme';
import { multiWalletStorage, WalletAddress } from '@/utils/secureStorage';
import {
  getWalletBalance,
  formatBTCBalance,
  getTxListByAddressInTxPool,
  calculateScriptPubKey,
  formatTransactionList,
  Transaction,
  queryUTXOByAddress,
  submitTransaction
} from '@/utils/blockchainApi';

export default function HomeScreen() {
  const router = useRouter();
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const sendSlideAnim = useRef(new Animated.Value(500)).current;
  const receiveSlideAnim = useRef(new Animated.Value(500)).current;
  const sendOverlayAnim = useRef(new Animated.Value(0)).current;
  const receiveOverlayAnim = useRef(new Animated.Value(0)).current;

  const [sendData, setSendData] = useState({
    coinIndex: 0,
    toAddress: '',
    amount: '',
    fee: '',
    amountUnitIndex: 0,
    feeUnitIndex: 0,
    selectedAddressIndex: -1, // -1 表示自动选择，>=0 表示手动选择的地址索引
    senderAddress: '',
    senderBalance: '0.00 BTC',
    addressList: [] as (string | WalletAddress)[],
  });


  const [receiveData, setReceiveData] = useState({
    coinIndex: 0,
    addressIndex: '0',
    derivedPath: '',
    derivedAddress: '',
    addressList: [] as (string | WalletAddress)[], // 地址列表
  });

  const coinList = [
    { id: 'btc', name: 'Bitcoin', unit: ['BTC', 'Satoshi'] },
    { id: 'eth', name: 'Ethereum', unit: ['ETH', 'Wei'] }
  ];

  const getCoinUnitList = (coinIndex: number) => {
    return coinList[coinIndex]?.unit || ['BTC', 'Satoshi'];
  };

  // 加载钱包余额
  const loadWalletBalance = async () => {
    try {
      setLoadingBalance(true);
      const walletId = await multiWalletStorage.getActiveWalletId();
      if (!walletId) {
        console.log('未找到激活的钱包');
        return;
      }
      const wallet = await multiWalletStorage.getWalletById(walletId);

      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        console.log('钱包没有地址');
        setTotalBalance(0);
        return;
      }

      // 查询钱包余额
      const balanceInfo = await getWalletBalance(wallet.addresses, 2);
      setTotalBalance(balanceInfo.totalBalanceBTC);

      // 更新钱包中的余额字段
      await multiWalletStorage.updateWalletBalance(walletId, balanceInfo.totalBalanceBTC);
    } catch (error) {
      console.error('加载钱包余额失败:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    loadWalletBalance();
    loadTransactions();
  }, []);

  // 加载交易记录
  const loadTransactions = async () => {
    try {
      setLoadingTransactions(true);

      // 获取第一个地址来查询交易
      const wallet = await multiWalletStorage.getActiveWallet();
      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        console.log('钱包没有地址,无法查询交易');
        setTransactions([]);
        return;
      }

      // 使用第一个地址
      const firstAddress = wallet.addresses[0];
      const addressStr = typeof firstAddress === 'string' ? firstAddress : firstAddress.address;

      // 计算 scriptPubKey
      const myScriptPubKey = calculateScriptPubKey(addressStr);
      console.log('查询交易池 - 地址:', myScriptPubKey);

      // 查询交易池
      const txPoolData = await getTxListByAddressInTxPool(addressStr);
      console.log('交易池查询结果:', txPoolData);

      if (txPoolData && txPoolData.length > 0) {
        // 格式化交易数据
        const formattedTxs = formatTransactionList(txPoolData, myScriptPubKey);
        setTransactions(formattedTxs.slice(0, 10)); // 只显示最近10条
      } else {
        setTransactions([
          {
            id: 'empty',
            txId: '',
            title: '暂无交易记录',
            time: '',
            amount: '',
            type: 'empty',
            icon: 'document-text-outline',
            status: 'empty',
            statusText: ''
          }
        ]);
      }
    } catch (error) {
      console.error('加载交易记录失败:', error);
      setTransactions([
        {
          id: 'empty',
          txId: '',
          title: '暂无交易记录',
          time: '',
          amount: '',
          type: 'empty',
          icon: 'document-text-outline',
          status: 'empty',
          statusText: ''
        }
      ]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleSendPress = async () => {
    try {
      const walletId = await multiWalletStorage.getActiveWalletId();
      if (!walletId) {
        Alert.alert('提示', '请先创建或选择钱包');
        return;
      }
      const wallet = await multiWalletStorage.getWalletById(walletId);

      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        Alert.alert('提示', '钱包中没有地址，请先生成地址');
        return;
      }

      // 初始化发送数据，加载钱包地址列表
      setSendData(prev => ({
        ...prev,
        addressList: wallet.addresses,
        selectedAddressIndex: -1,
        senderAddress: '',
        senderBalance: '0.00 BTC',
      }));

      setShowSendModal(true);
      Animated.parallel([
        Animated.timing(sendOverlayAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(sendSlideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (error) {
      console.error('加载钱包地址失败:', error);
      Alert.alert('错误', '加载钱包地址失败');
    }
  };

  const handleReceivePress = async () => {
    // 加载钱包地址
    try {
      const walletId = await multiWalletStorage.getActiveWalletId();
      if (!walletId) {
        Alert.alert('提示', '请先创建或选择钱包');
        return;
      }
      const wallet = await multiWalletStorage.getWalletById(walletId);

      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        Alert.alert('提示', '钱包中没有地址，请先生成地址');
        return;
      }

      // 设置默认接收地址（第一个地址）
      const firstAddress = wallet.addresses[0];
      const addressStr = typeof firstAddress === 'string' ? firstAddress : firstAddress.address;
      const pathStr = typeof firstAddress === 'string' ? '' : firstAddress.path;

      setReceiveData(prev => ({
        ...prev,
        addressList: wallet.addresses,
        addressIndex: '0',
        derivedPath: pathStr,
        derivedAddress: addressStr,
      }));

      setShowReceiveModal(true);
      Animated.parallel([
        Animated.timing(receiveOverlayAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(receiveSlideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (error) {
      console.error('加载钱包地址失败:', error);
      Alert.alert('错误', '加载钱包地址失败');
    }
  };

  const closeSendModal = () => {
    Animated.parallel([
      Animated.timing(sendOverlayAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(sendSlideAnim, {
        toValue: 500,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowSendModal(false);
    });
    setSendData({
      coinIndex: 0,
      toAddress: '',
      amount: '',
      fee: '',
      amountUnitIndex: 0,
      feeUnitIndex: 0,
      selectedAddressIndex: -1,
      senderAddress: '',
      senderBalance: '0.00 BTC',
      addressList: [],
    });
  };

  const closeReceiveModal = () => {
    Animated.parallel([
      Animated.timing(receiveOverlayAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(receiveSlideAnim, {
        toValue: 500,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowReceiveModal(false);
    });
    setReceiveData({
      coinIndex: 0,
      addressIndex: '0',
      derivedPath: '',
      derivedAddress: '',
      addressList: [],
    });
  };

  const handleConfirmSend = async () => {
    console.log('===== handleConfirmSend 被调用 =====');
    console.log('sendData:', sendData);

    // 表单验证
    if (!sendData.toAddress) {
      console.log('验证失败: 接收地址为空');
      Alert.alert('提示', '请输入接收地址');
      return;
    }
    console.log('接收地址验证通过:', sendData.toAddress);

    if (!sendData.amount) {
      console.log('验证失败: 发送金额为空');
      Alert.alert('提示', '请输入发送金额');
      return;
    }
    console.log('发送金额验证通过:', sendData.amount);

    const amountValue = parseFloat(sendData.amount);
    console.log('解析金额值:', amountValue);

    if (amountValue <= 0) {
      console.log('验证失败: 金额必须大于0');
      Alert.alert('提示', '发送金额必须大于0');
      return;
    }

    // 获取当前币种单位和信息
    const coinUnit = getCoinUnitList(sendData.coinIndex);
    const selectedCoin = coinList[sendData.coinIndex];
    console.log('币种:', selectedCoin.name, '单位列表:', coinUnit);

    // 转换为最小单位 (Satoshi for BTC)
    const decimalPlaces = 100000000;
    let amountInSmallestUnit: number;
    if (sendData.amountUnitIndex === 0) {
      amountInSmallestUnit = Math.floor(amountValue * decimalPlaces);
    } else {
      amountInSmallestUnit = Math.floor(amountValue);
    }
    console.log('转换为最小单位:', amountInSmallestUnit, 'satoshis');

    const amountInMainUnit = amountInSmallestUnit / decimalPlaces;
    console.log('转换为主单位:', amountInMainUnit, 'BTC');

    // 处理手续费
    let feeInSmallestUnit: number;
    if (sendData.fee) {
      const feeValue = parseFloat(sendData.fee);
      console.log('解析手续费:', feeValue);
      if (feeValue < 0) {
        console.log('验证失败: 手续费不能为负数');
        Alert.alert('提示', '手续费不能为负数');
        return;
      }
      if (sendData.feeUnitIndex === 0) {
        feeInSmallestUnit = Math.floor(feeValue * decimalPlaces);
      } else {
        feeInSmallestUnit = Math.floor(feeValue);
      }
    } else {
      // 默认手续费 0.0001 BTC
      feeInSmallestUnit = 10000;
    }
    console.log('手续费(satoshis):', feeInSmallestUnit);

    const feeInMainUnit = feeInSmallestUnit / decimalPlaces;
    const totalSmallestUnit = amountInSmallestUnit + feeInSmallestUnit;
    const totalInMainUnit = totalSmallestUnit / decimalPlaces;

    console.log('总额(satoshis):', totalSmallestUnit);
    console.log('总额(BTC):', totalInMainUnit);

    // 显示确认对话框
    const coinName = selectedCoin.name;
    const smallestUnitName = coinUnit[1];

    console.log('准备显示确认对话框...');

    Alert.alert(
      '确认发送',
      `确定要发送 ${amountInMainUnit.toFixed(8)} ${coinName} (${amountInSmallestUnit} ${smallestUnitName}) 到 ${sendData.toAddress} 吗?\n手续费: ${feeInMainUnit.toFixed(8)} ${coinName} (${feeInSmallestUnit} ${smallestUnitName})\n总计: ${totalInMainUnit.toFixed(8)} ${coinName} (${totalSmallestUnit} ${smallestUnitName})`,
      [
        { text: '取消', style: 'cancel' },
        { text: '确认', onPress: () => {
          console.log('用户点击了确认按钮');
          executeSend(amountInMainUnit, feeInMainUnit, amountInSmallestUnit, feeInSmallestUnit);
        }}
      ]
    );
  };

  // 执行发送
  const executeSend = async (_amountInBTC: number, _feeInBTC: number, amountInSatoshis: number, feeInSatoshis: number) => {
    try {
      // 1. 获取钱包信息
      const walletId = await multiWalletStorage.getActiveWalletId();
      if (!walletId) {
        Alert.alert('错误', '请先选择钱包');
        return;
      }

      const wallet = await multiWalletStorage.getWalletById(walletId);
      if (!wallet || !wallet.addresses || wallet.addresses.length === 0) {
        Alert.alert('错误', '钱包中没有地址');
        return;
      }

      // 2. 确定使用的地址
      let selectedAddress: string | WalletAddress;
      let addressIndex: number;

      if (sendData.selectedAddressIndex >= 0) {
        // 用户手动选择了地址
        selectedAddress = wallet.addresses[sendData.selectedAddressIndex];
        addressIndex = sendData.selectedAddressIndex;
        console.log('用户手动选择地址索引:', addressIndex);
      } else {
        // 自动选择：从第一个地址开始
        selectedAddress = wallet.addresses[0];
        addressIndex = 0;
        console.log('自动选择第一个地址索引:', addressIndex);
      }

      const addressStr = typeof selectedAddress === 'string' ? selectedAddress : selectedAddress.address;
      const pathStr = typeof selectedAddress === 'string' ? '' : selectedAddress.path;

      console.log('使用的地址:', addressStr);
      console.log('派生路径:', pathStr);

      // 3. 派生密钥
      // 使用空密码或固定密码解密种子
      const password = '';
      console.log('使用密码解密种子...');

      const decryptedSeed = multiWalletStorage.decryptSeed(wallet.encryptedSeed, password);
      if (!decryptedSeed) {
        Alert.alert('错误', '解密种子失败');
        return;
      }

      console.log('种子解密成功,长度:', decryptedSeed.length);

      const seedBuffer = Buffer.from(decryptedSeed, 'hex');
      const hdkey = HDKey.fromMasterSeed(seedBuffer);
      const derivedKey = hdkey.derive(pathStr || `m/44'/0'/0'/0/0`);
      const privateKeyBytes = derivedKey.privateKey;

      if (!privateKeyBytes || privateKeyBytes.length !== 32) {
        throw new Error(`私钥长度不正确`);
      }

      // 使用 Ed25519 生成密钥对
      const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
      const publicKeyBytes = keyPair.publicKey;
      const secretKeyBytes = keyPair.secretKey;

      const senderAddress = bs58.encode(publicKeyBytes);
      console.log('发送方地址:', senderAddress);
      console.log('公钥长度:', publicKeyBytes.length);
      console.log('私钥长度:', secretKeyBytes.length);

      // 4. 查询UTXO
      console.log('开始查询UTXO...');
      const utxoList = await queryUTXOByAddress(senderAddress);

      console.log('UTXO查询结果:', utxoList);

      if (!utxoList || utxoList.length === 0) {
        Alert.alert('错误', '该地址没有可用的UTXO');
        return;
      }

      // 4. 计算需要的UTXO
      const totalNeeded = amountInSatoshis + feeInSatoshis;

      console.log('需要总金额:', totalNeeded, 'satoshis');
      console.log('发送金额:', amountInSatoshis, 'satoshis');
      console.log('手续费:', feeInSatoshis, 'satoshis');

      let selectedUtxos: any[] = [];
      let totalInput = 0;

      // 选择UTXO
      for (const utxo of utxoList) {
        console.log('UTXO状态:', utxo.statusStr, 'value:', utxo.value);
        if (utxo.statusStr === '已确认未花费') {
          selectedUtxos.push(utxo);
          totalInput += utxo.value;
          if (totalInput >= totalNeeded) {
            break;
          }
        }
      }

      console.log('选择的UTXO数量:', selectedUtxos.length);
      console.log('输入总额:', totalInput, 'satoshis');

      if (totalInput < totalNeeded) {
        Alert.alert('错误', '余额不足');
        return;
      }

      // 5. 构建交易输出
      const outputs: any[] = [];
      const change = totalInput - totalNeeded;

      console.log('找零金额:', change, 'satoshis');

      // 主输出：转账给目标地址
      const targetScriptPubKey = calculateScriptPubKey(sendData.toAddress);
      console.log('目标地址:', sendData.toAddress);
      console.log('目标地址锁定脚本:', targetScriptPubKey);
      console.log('目标地址锁定脚本长度:', targetScriptPubKey.length);

      outputs.push({
        value: amountInSatoshis,
        scriptPubKey: targetScriptPubKey
      });

      // 找零输出
      if (change > 0) {
        const senderScriptPubKey = calculateScriptPubKey(senderAddress);
        console.log('发送方scriptPubKey:', senderScriptPubKey);
        console.log('发送方scriptPubKey长度:', senderScriptPubKey.length);
        outputs.push({
          value: change,
          scriptPubKey: senderScriptPubKey
        });
      }

      console.log('交易输出数量:', outputs.length);

      // 6. 构建交易输入并签名每个输入
      const inputs: any[] = [];
      const SIGHASH_ALL = 0x01;

      console.log('===== 开始构建交易输入并签名 =====');

      for (let i = 0; i < selectedUtxos.length; i++) {
        console.log(`\n--- 处理第${i + 1}个输入 ---`);
        const utxo = selectedUtxos[i];
        console.log('UTXO txId:', utxo.txId);
        console.log('UTXO index:', utxo.index);
        console.log('UTXO value:', utxo.value);

        let currentUtxoScriptPubKey = utxo.script || utxo.scriptPubKey;
        console.log('原始 scriptPubKey:', currentUtxoScriptPubKey);

        // 如果scriptPubKey不是40个字符（20字节的hex），需要计算
        if (currentUtxoScriptPubKey && currentUtxoScriptPubKey.length !== 40) {
          currentUtxoScriptPubKey = calculateScriptPubKey(currentUtxoScriptPubKey);
          console.log('计算后的 scriptPubKey:', currentUtxoScriptPubKey);
        }

        // 构建签名消息
        const originalInputs = selectedUtxos.map((u, idx) => {
          if (idx === i) {
            return {
              txId: u.txId,
              index: u.index,
              sequence: u.sequence || 0xFFFFFFFF,
              scriptSig: currentUtxoScriptPubKey
            };
          } else {
            return {
              txId: u.txId,
              index: u.index,
              sequence: u.sequence || 0xFFFFFFFF,
              scriptSig: ''
            };
          }
        });

        const signatureMessage = prepareSigningData(i, originalInputs, outputs, SIGHASH_ALL);
        console.log('签名消息长度:', signatureMessage.length);

        // 计算SHA256哈希
        const messageWordArray = CryptoJS.lib.WordArray.create(signatureMessage);
        const sha256Hash = CryptoJS.SHA256(messageWordArray);
        console.log('SHA256哈希结果:', sha256Hash.toString(CryptoJS.enc.Hex));

        const hashBytes = hexToBytes(sha256Hash.toString(CryptoJS.enc.Hex));
        const hashUint8Array = new Uint8Array(hashBytes);

        // 使用Ed25519对哈希后的消息签名
        const signature = nacl.sign.detached(hashUint8Array, secretKeyBytes);
        console.log('签名长度:', signature.length);
        console.log('签名hex:', bufferToHex(signature));

        // 本地验证签名
        const isValid = nacl.sign.detached.verify(hashUint8Array, signature, publicKeyBytes);
        console.log('本地签名验证结果:', isValid);

        // 构建scriptSig: [64字节签名][1字节签名类型][32字节公钥]
        const scriptSig = buildScriptSig(signature, publicKeyBytes);
        console.log('scriptSig长度:', scriptSig.length / 2, '字节');

        inputs.push({
          txId: utxo.txId,
          index: utxo.index,
          sequence: 0xFFFFFFFF,
          scriptSig: scriptSig
        });

        console.log(`输入${i}处理完成\n`);
      }

      console.log('===== 所有输入处理完成 =====');

      // 7. 构建TransferDTO并提交
      const transferData = {
        version: 1,
        lockTime: 0,
        inputs: inputs,
        outputs: outputs
      };

      console.log('===== 准备提交交易 =====');
      console.log('版本号:', transferData.version);
      console.log('锁定时间:', transferData.lockTime);
      console.log('输入数量:', transferData.inputs.length);
      transferData.inputs.forEach((input, idx) => {
        console.log(`输入${idx}:`, {
          txId: input.txId,
          index: input.index,
          scriptSig长度: input.scriptSig.length / 2,
          scriptSig前缀: input.scriptSig.substring(0, 64) + '...'
        });
      });
      console.log('输出数量:', transferData.outputs.length);
      transferData.outputs.forEach((output, idx) => {
        console.log(`输出${idx}:`, {
          value: output.value,
          scriptPubKey: output.scriptPubKey
        });
      });

      console.log('提交交易数据:', JSON.stringify(transferData, null, 2));

      const result = await submitTransaction(transferData);

      console.log('提交交易结果:', result);

      if (result && result.success) {
        // 刷新余额
        await loadWalletBalance();
        await loadTransactions();

        Alert.alert('成功', '交易已提交到网络');

        // 关闭弹窗
        closeSendModal();
      } else {
        Alert.alert('失败', result?.message || '交易提交失败');
      }
    } catch (error: any) {
      console.error('发送失败:', error);
      Alert.alert('错误', '发送失败: ' + (error.message || '未知错误'));
    }
  };

  // 辅助方法：构建签名消息
  const prepareSigningData = (inputIndex: number, originalInputs: any[], originalOutputs: any[], sighashType: number) => {
    const baseSigHash = sighashType & 0x1F;
    const anyoneCanPay = (sighashType & 0x80) !== 0;

    const txCopy = {
      version: 1,
      lockTime: 0,
      inputs: [] as any[],
      outputs: [] as any[]
    };

    // 处理输入
    if (anyoneCanPay) {
      txCopy.inputs.push(originalInputs[inputIndex]);
    } else {
      for (let i = 0; i < originalInputs.length; i++) {
        const input = originalInputs[i];
        if (i === inputIndex) {
          txCopy.inputs.push({
            ...input,
            sequence: input.sequence || 0xFFFFFFFF
          });
        } else {
          txCopy.inputs.push({
            txId: input.txId,
            index: input.index,
            sequence: input.sequence || 0xFFFFFFFF,
            scriptSig: ''
          });
        }
      }
    }

    // 处理输出
    if (baseSigHash === 0x02) {
      txCopy.outputs = [];
    } else if (baseSigHash === 0x03) {
      if (inputIndex >= originalOutputs.length) {
        txCopy.outputs = [];
      } else {
        for (let i = 0; i < originalOutputs.length; i++) {
          if (i < inputIndex || i === inputIndex) {
            txCopy.outputs.push(originalOutputs[i]);
          } else {
            txCopy.outputs.push({
              value: -1,
              scriptPubKey: ''
            });
          }
        }
      }
    } else {
      for (const output of originalOutputs) {
        txCopy.outputs.push(output);
      }
    }

    // 序列化交易
    const serializedTx = serializeTransaction(txCopy);

    // 追加4字节小端序的sighashType
    const sigHashBytes = littleEndianEncode(sighashType, 4);

    const message = new Uint8Array([
      ...serializedTx,
      ...sigHashBytes
    ]);

    return message;
  };

  // 序列化交易
  const serializeTransaction = (tx: any) => {
    const result: number[] = [];

    // 版本号
    result.push(...littleEndianEncode(tx.version, 4));

    // 输入数量
    result.push(...encodeVarInt(tx.inputs.length));

    // 序列化每个输入
    for (const input of tx.inputs) {
      result.push(...serializeInput(input));
    }

    // 输出数量
    result.push(...encodeVarInt(tx.outputs.length));

    // 序列化每个输出
    for (const output of tx.outputs) {
      result.push(...serializeOutput(output));
    }

    // 锁定时间
    result.push(...littleEndianEncode(tx.lockTime, 4));

    return new Uint8Array(result);
  };

  // 序列化输入
  const serializeInput = (input: any) => {
    const result: number[] = [];

    // txId (32字节)
    const txIdBytes = hexToBytes(input.txId);
    result.push(...txIdBytes);

    // index (4字节)
    result.push(...littleEndianEncode(input.index, 4));

    // sequence (4字节)
    const sequence = input.sequence || 0xFFFFFFFF;
    result.push(...littleEndianEncode(sequence, 4));

    // scriptSig
    const scriptSigBytes = hexToBytes(input.scriptSig || '');
    result.push(...encodeVarInt(scriptSigBytes.length));
    result.push(...scriptSigBytes);

    return result;
  };

  // 序列化输出
  const serializeOutput = (output: any) => {
    const result: number[] = [];

    // value (8字节)
    result.push(...longToLittleEndian(output.value));

    // scriptPubKey (20字节)
    const scriptPubKeyBytes = hexToBytes(output.scriptPubKey || '');
    result.push(...encodeVarInt(scriptPubKeyBytes.length));
    result.push(...scriptPubKeyBytes);

    return result;
  };

  // 构建scriptSig
  const buildScriptSig = (signature: Uint8Array, publicKey: Uint8Array) => {
    const scriptSig = new Uint8Array(97);

    scriptSig.set(signature, 0);
    scriptSig[64] = 0x01; // SIGHASH_ALL
    scriptSig.set(publicKey, 65);

    const hex = bufferToHex(scriptSig);
    console.log('构建scriptSig:', {
      签名长度: signature.length,
      签名hex: bufferToHex(signature),
      签名类型: '0x01 (SIGHASH_ALL)',
      公钥长度: publicKey.length,
      公钥hex: bufferToHex(publicKey),
      scriptSig长度: scriptSig.length,
      scriptSighex: hex
    });

    return hex;
  };

  // 小端编码
  const littleEndianEncode = (num: number, bytes: number) => {
    const result: number[] = [];
    for (let i = 0; i < bytes; i++) {
      result.push(num & 0xff);
      num >>= 8;
    }
    return result;
  };

  // 小端编码long类型(8字节)
  const longToLittleEndian = (num: number) => {
    const result: number[] = [];
    let bigNum = BigInt(num);
    for (let i = 0; i < 8; i++) {
      result.push(Number(bigNum & 0xffn));
      bigNum >>= 8n;
    }
    return result;
  };

  // VarInt编码
  const encodeVarInt = (value: number) => {
    const bigValue = BigInt(value);
    if (bigValue < 0xFdn) {
      return [Number(bigValue)];
    } else if (bigValue <= 0xFFFFn) {
      return [0xFD, Number(bigValue & 0xFFn), Number((bigValue >> 8n) & 0xFFn)];
    } else if (bigValue <= 0xFFFFFFFFn) {
      return [
        0xFE,
        Number(bigValue & 0xFFn),
        Number((bigValue >> 8n) & 0xFFn),
        Number((bigValue >> 16n) & 0xFFn),
        Number((bigValue >> 24n) & 0xFFn)
      ];
    } else {
      return [
        0xFF,
        Number(bigValue & 0xFFn),
        Number((bigValue >> 8n) & 0xFFn),
        Number((bigValue >> 16n) & 0xFFn),
        Number((bigValue >> 24n) & 0xFFn),
        Number((bigValue >> 32n) & 0xFFn),
        Number((bigValue >> 40n) & 0xFFn),
        Number((bigValue >> 48n) & 0xFFn),
        Number((bigValue >> 56n) & 0xFFn)
      ];
    }
  };

  // Hex字符串转字节数组
  const hexToBytes = (hex: string) => {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return bytes;
  };

  // Buffer转Hex字符串
  const bufferToHex = (buffer: Uint8Array) => {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await Clipboard.setStringAsync(address);
    } catch (error) {
      console.error('复制失败:', error);
      Alert.alert('错误', '复制失败');
    }
  };

  const handleTransactionPress = (tx: Transaction) => {
    if (tx.id === 'empty') {
      return;
    }
    // 将交易数据编码后传递
    const txDataEncoded = encodeURIComponent(JSON.stringify(tx));
    router.push(`/tx-detail?txData=${txDataEncoded}`);
  };

  return (
    <View style={styles.container}>
      {/* 头部导航栏 */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logo}>
            <Ionicons name="wallet" size={20} color="#000000" />
            <ThemedText style={styles.logoText}>Bitcoin WALLET</ThemedText>
          </View>
        </View>
      </View>

      <ParallaxScrollView>
      {/* 资产概览 */}
      <ThemedView style={styles.assetsOverview}>
        <ThemedText style={styles.sectionLabel}>总资产</ThemedText>
        <ThemedText type="title" style={styles.totalBalance}>
          {loadingBalance ? '加载中...' : `${formatBTCBalance(totalBalance)} BTC`}
        </ThemedText>
        {!loadingBalance && (
          <TouchableOpacity onPress={loadWalletBalance} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color="#666666" />
          </TouchableOpacity>
        )}
      </ThemedView>

      {/* 快速操作 */}
      <ThemedView style={styles.quickActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSendPress}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="arrow-up" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>转账</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleReceivePress}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="arrow-down" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>收款</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="swap-horizontal" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>兑换</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <ThemedView style={styles.actionIconContainer}>
            <Ionicons name="grid" size={24} color="#000000" />
          </ThemedView>
          <ThemedText style={styles.actionText}>更多</ThemedText>
        </TouchableOpacity>
      </ThemedView>


      {/* 最近交易 */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedView style={styles.sectionHeader}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>交易记录</ThemedText>
          <TouchableOpacity onPress={loadTransactions}>
            <Ionicons name="refresh" size={16} color="#666666" />
          </TouchableOpacity>
        </ThemedView>

        {loadingTransactions ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>加载中...</ThemedText>
          </ThemedView>
        ) : transactions.length === 0 || transactions[0].id === 'empty' ? (
          <ThemedView style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#888888" />
            <ThemedText style={styles.emptyText}>暂无交易记录</ThemedText>
            <ThemedText style={styles.emptySubtext}>开始使用钱包，记录您的第一笔交易</ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.transactionList}>
            {transactions.map((tx) => {
              const iconStyleKey = `transactionIcon${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}`;
              const statusStyleKey = `transaction${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}`;
              const iconStyle = (styles as any)[iconStyleKey];
              const statusStyle = (styles as any)[statusStyleKey];
              return (
                <TouchableOpacity
                  key={tx.id}
                  style={styles.transactionItem}
                  onPress={() => handleTransactionPress(tx)}
                  disabled={tx.id === 'empty'}
                >
                  <View style={styles.transactionLeft}>
                    <View style={[styles.transactionIcon, iconStyle]}>
                      <Ionicons
                        name={tx.icon === 'arrow-up' ? 'arrow-up' : 'arrow-down' as any}
                        size={16}
                        color="#ffffff"
                      />
                    </View>
                    <View style={styles.transactionDetails}>
                      <ThemedText style={styles.transactionTitle}>{tx.title}</ThemedText>
                      <ThemedText style={styles.transactionTime}>{tx.time}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.transactionRight}>
                    <ThemedText style={[styles.transactionAmount, statusStyle]}>
                      {tx.amount}
                    </ThemedText>
                    <ThemedText style={[styles.transactionStatus, statusStyle]}>
                      {tx.statusText}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ThemedView>

      {/* 常用功能 */}
      <ThemedView style={styles.sectionContainer}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>常用功能</ThemedText>
        <ThemedView style={styles.featuresGrid}>
          <Link href="/wallet-management" asChild>
            <TouchableOpacity style={styles.featureItem}>
              <Ionicons name="wallet-outline" size={24} color="#333333" />
              <ThemedText style={styles.featureText}>钱包管理</ThemedText>
            </TouchableOpacity>
          </Link>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="scan-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>扫一扫</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>安全设置</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="help-circle-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>帮助中心</ThemedText>
          </TouchableOpacity>
          <Link href="/transactions" asChild>
            <TouchableOpacity style={styles.featureItem}>
              <Ionicons name="receipt-outline" size={24} color="#333333" />
              <ThemedText style={styles.featureText}>交易历史</ThemedText>
            </TouchableOpacity>
          </Link>
          <TouchableOpacity style={styles.featureItem}>
            <Ionicons name="settings-outline" size={24} color="#333333" />
            <ThemedText style={styles.featureText}>系统设置</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      {/* 发送弹窗 */}
      <Modal
        visible={showSendModal}
        animationType="none"
        transparent={true}
        onRequestClose={closeSendModal}
      >
        <Animated.View style={[
          styles.modalOverlay,
          { opacity: sendOverlayAnim }
        ]}>
          <Animated.View style={[
            styles.modalContainer,
            { transform: [{ translateY: sendSlideAnim }] }
          ]}>
            {/* 弹窗头部 */}
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>发送</ThemedText>
              <TouchableOpacity onPress={closeSendModal} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* 弹窗内容 */}
            <ScrollView style={styles.modalContent}>
              {/* 币种选择 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>币种</ThemedText>
                <View style={styles.formPicker}>
                  <ThemedText style={styles.pickerText}>{coinList[sendData.coinIndex].name}</ThemedText>
                  <Ionicons name="chevron-forward" size={14} color="#999999" />
                </View>
              </View>

              {/* 发送方地址选择 */}
              {coinList[sendData.coinIndex].id === 'btc' && sendData.addressList.length > 0 && (
                <View style={styles.formItem}>
                  <ThemedText style={styles.formLabel}>发送方地址</ThemedText>
                  <ScrollView style={styles.addressList} nestedScrollEnabled>
                    {/* 自动选择选项 */}
                    <TouchableOpacity
                      style={[
                        styles.addressItem,
                        sendData.selectedAddressIndex === -1 && styles.addressItemSelected
                      ]}
                      onPress={() => {
                        setSendData({
                          ...sendData,
                          selectedAddressIndex: -1,
                          senderAddress: '',
                          senderBalance: '0.00 BTC',
                        });
                      }}
                    >
                      <View style={styles.addressItemContent}>
                        <ThemedText style={styles.addressIndex}>自动选择</ThemedText>
                        <ThemedText style={styles.addressText}>系统自动选择地址</ThemedText>
                      </View>
                      {sendData.selectedAddressIndex === -1 && (
                        <Ionicons name="checkmark-circle" size={20} color="#000000" />
                      )}
                    </TouchableOpacity>

                    {/* 地址列表 */}
                    {sendData.addressList.map((addr, index) => {
                      const addressStr = typeof addr === 'string' ? addr : addr.address;
                      const isSelected = index === sendData.selectedAddressIndex;
                      return (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.addressItem,
                            isSelected && styles.addressItemSelected
                          ]}
                          onPress={() => {
                            setSendData({
                              ...sendData,
                              selectedAddressIndex: index,
                              senderAddress: addressStr,
                              senderBalance: '0.00 BTC',
                            });
                          }}
                        >
                          <View style={styles.addressItemContent}>
                            <ThemedText style={styles.addressIndex}>地址 {index + 1}</ThemedText>
                            <ThemedText style={styles.addressText}>{addressStr}</ThemedText>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color="#000000" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* 接收地址 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>接收地址</ThemedText>
                <TextInput
                  style={styles.formInput}
                  value={sendData.toAddress}
                  onChangeText={(text) => setSendData({ ...sendData, toAddress: text })}
                  placeholder="请输入接收地址"
                />
              </View>

              {/* 发送金额 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>发送金额</ThemedText>
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={styles.formInputFlex}
                    value={sendData.amount}
                    onChangeText={(text) => setSendData({ ...sendData, amount: text })}
                    placeholder="请输入发送金额"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.unitPicker}>
                    <ThemedText style={styles.unitText}>
                      {getCoinUnitList(sendData.coinIndex)[sendData.amountUnitIndex]}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={12} color="#999999" />
                  </View>
                </View>
                <ThemedText style={styles.formHint}>
                  可用余额: {sendData.senderBalance}
                </ThemedText>
              </View>

              {/* 手续费 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>手续费</ThemedText>
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={styles.formInputFlex}
                    value={sendData.fee}
                    onChangeText={(text) => setSendData({ ...sendData, fee: text })}
                    placeholder="留空使用默认手续费"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.unitPicker}>
                    <ThemedText style={styles.unitText}>
                      {getCoinUnitList(sendData.coinIndex)[sendData.feeUnitIndex]}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={12} color="#999999" />
                  </View>
                </View>
                <ThemedText style={styles.formHint}>
                  留空使用默认: 0.0001 {getCoinUnitList(sendData.coinIndex)[0]}
                </ThemedText>
              </View>

              {/* 发送按钮 */}
              <View style={styles.btnGroup}>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleConfirmSend}>
                  <ThemedText style={styles.btnText}>确认发送</ThemedText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* 接收弹窗 */}
      <Modal
        visible={showReceiveModal}
        animationType="none"
        transparent={true}
        onRequestClose={closeReceiveModal}
      >
        <Animated.View style={[
          styles.modalOverlay,
          { opacity: receiveOverlayAnim }
        ]}>
          <Animated.View style={[
            styles.modalContainer,
            { transform: [{ translateY: receiveSlideAnim }] }
          ]}>
            {/* 弹窗头部 */}
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>接收地址</ThemedText>
              <TouchableOpacity onPress={closeReceiveModal} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* 弹窗内容 */}
            <ScrollView style={styles.modalContent}>
              {/* 币种选择 */}
              <View style={styles.formItem}>
                <ThemedText style={styles.formLabel}>币种</ThemedText>
                <View style={styles.formPicker}>
                  <ThemedText style={styles.pickerText}>{coinList[receiveData.coinIndex].name}</ThemedText>
                  <Ionicons name="chevron-forward" size={14} color="#999999" />
                </View>
              </View>

              {/* 地址选择(仅比特币显示) */}
              {coinList[receiveData.coinIndex].id === 'btc' && receiveData.addressList.length > 0 && (
                <View style={styles.formItem}>
                  <ThemedText style={styles.formLabel}>接收地址</ThemedText>
                  <ScrollView style={styles.addressList} nestedScrollEnabled>
                    {receiveData.addressList.map((addr, index) => {
                      const addressStr = typeof addr === 'string' ? addr : addr.address;
                      const isSelected = index === parseInt(receiveData.addressIndex);
                      return (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.addressItem,
                            isSelected && styles.addressItemSelected
                          ]}
                          onPress={() => {
                            const pathStr = typeof addr === 'string' ? '' : addr.path;
                            setReceiveData({
                              ...receiveData,
                              addressIndex: index.toString(),
                              derivedPath: pathStr,
                              derivedAddress: addressStr,
                            });
                          }}
                        >
                          <View style={styles.addressItemContent}>
                            <ThemedText style={styles.addressIndex}>地址 {index + 1}</ThemedText>
                            <ThemedText style={styles.addressText}>{addressStr}</ThemedText>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color="#000000" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* 派生路径显示 */}
              {receiveData.derivedPath ? (
                <View style={styles.derivationPath}>
                  <ThemedText style={styles.pathLabel}>派生路径:</ThemedText>
                  <ThemedText style={styles.pathValue}>{receiveData.derivedPath}</ThemedText>
                </View>
              ) : null}

              {/* 生成结果 */}
              {receiveData.derivedAddress && (
                <View style={styles.resultSection}>
                  {/* 地址显示和复制 */}
                  <View style={styles.resultItem}>
                    <ThemedText style={styles.resultLabel}>接收地址</ThemedText>
                    <View style={styles.addressDisplayContainer}>
                      <ThemedText style={styles.resultValue} numberOfLines={2}>{receiveData.derivedAddress}</ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={() => handleCopyAddress(receiveData.derivedAddress)}
                    >
                      <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
                      <ThemedText style={styles.copyButtonText}>复制地址</ThemedText>
                    </TouchableOpacity>
                  </View>

                  {/* 二维码显示 */}
                  <View style={styles.qrCodeContainer}>
                    <QRCode
                      value={receiveData.derivedAddress}
                      size={200}
                    />
                  </View>
                </View>
              )}

              {/* 底部关闭按钮 */}
              <View style={styles.btnGroup}>
                <TouchableOpacity style={styles.btnSecondary} onPress={closeReceiveModal}>
                  <ThemedText style={styles.btnText}>关闭</ThemedText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

    </ParallaxScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    zIndex: 100,
    paddingTop: statusBarHeight,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 6,
  },
  assetsOverview: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 30,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionLabel: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 8,
  },
  totalBalance: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  refreshBtn: {
    position: 'absolute',
    right: 10,
    top: 8,
    padding: 8,
  },
  fiatAmount: {
    fontSize: 16,
    color: '#555555',
  },
  balanceChange: {
    marginTop: 8,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  sectionContainer: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  seeAll: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
  },
  assetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  assetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetSymbol: {
    fontSize: 13,
    color: '#555555',
    marginTop: 2,
  },
  assetValue: {
    alignItems: 'flex-end',
    gap: 4,
  },
  fiatValue: {
    fontSize: 13,
    color: '#555555',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
    color: '#000000',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 6,
    color: '#555555',
  },
  transactionList: {
    gap: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionIconSend: {
    backgroundColor: '#ff6b6b',
  },
  transactionIconReceive: {
    backgroundColor: '#51cf66',
  },
  transactionIconEmpty: {
    backgroundColor: '#868e96',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 2,
  },
  transactionTime: {
    fontSize: 12,
    color: '#888888',
  },
  transactionRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionPending: {
    color: '#f59f00',
  },
  transactionCompleted: {
    color: '#51cf66',
  },
  transactionFailed: {
    color: '#ff6b6b',
  },
  transactionEmpty: {
    color: '#868e96',
  },
  transactionStatus: {
    fontSize: 12,
    color: '#888888',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 20,
  },
  featureItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  featureText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
  },
  // 弹窗样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#111111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 4,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  formItem: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#F5F5F5',
  },
  formInputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#F5F5F5',
  },
  formPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
  },
  pickerText: {
    fontSize: 14,
    color: '#000000',
  },
  formHint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
  },
  unitText: {
    fontSize: 14,
    color: '#000000',
  },
  derivationPath: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  pathLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  pathValue: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'monospace',
  },
  resultSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  resultItem: {
    marginBottom: 16,
    width: '100%',
  },
  qrCodeContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 13,
    color: '#000000',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  addressDisplayContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resultValueSmall: {
    fontSize: 12,
    color: '#000000',
    fontFamily: 'monospace',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  resultValueWithCopy: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copyBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
  },
  copyText: {
    fontSize: 12,
    color: '#000000',
  },
  addressList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  addressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  addressItemSelected: {
    backgroundColor: '#E8E8E8',
  },
  addressItemContent: {
    flex: 1,
  },
  addressIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#000000',
    fontFamily: 'monospace',
  },
  btnGroup: {
    marginTop: 20,
    gap: 12,
    marginBottom:40
  },
  btnPrimary: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
