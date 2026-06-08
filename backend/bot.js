require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { parseOrder, editOrderWithAI } = require('./gemini');
const dbService = require('./dbService');
const { scrapeLinksFromText } = require('./scraper');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const managerId = parseInt(process.env.MANAGER_TELEGRAM_ID, 10);

// In-memory state for the manager
const managerState = {
  mode: 'idle', // 'idle', 'editing_order', 'pay_search_customer', 'pay_enter_amount'
  currentData: null
};

// Pending actions map to handle concurrent customer linking
const pendingActions = new Map();

// Buffers for forwarded messages
const messageBuffers = new Map();
const BUFFER_TIMEOUT = 3000; // 3 seconds

// Middleware to restrict to manager
bot.use((ctx, next) => {
  if (ctx.from && ctx.from.id === managerId) {
    return next();
  }
});

bot.start((ctx) => ctx.reply('مرحباً بك في نظام إدارة الطلبات والديون. قم بتحويل رسائل الزبائن هنا.'));

const axios = require('axios');

// Helper to handle the actual order creation once customer is determined
async function processOrderForCustomer(ctx, customerId, customerName, messageText, imageParts = [], batchId = null) {
  ctx.reply(`تم تحديد الزبون: ${customerName}. جاري تحليل الطلبات بالذكاء الاصطناعي...`);
  
  const scrapedText = await scrapeLinksFromText(messageText);
  const result = await parseOrder(scrapedText, imageParts);
  
  if (!result) {
    return ctx.reply('حدث خطأ أثناء استخراج البيانات بالذكاء الاصطناعي.');
  }

  if (result.isOrder === false) {
    return ctx.reply('الرسالة ليست طلب لمنتج أو اشتراك.');
  }

  if (!result.orders || result.orders.length === 0) {
    return ctx.reply('لم يتم التعرف على الطلب من النص أو الصورة.');
  }

  let summary = `تم تسجيل الطلبات بنجاح 🚀\nالزبون: ${customerName}\n\n`;
  const buttons = [];

  for (const o of result.orders) {
    const qty = o.quantity || 1;
    const contextText = o.messageContext || messageText;
    const order = await dbService.createOrder(customerId, o.productName, o.duration, qty, contextText, batchId);
    summary += `المنتج: ${order.productName}\nالمدة: ${order.duration}\nالكمية: ${order.quantity}\n\n`;
    buttons.push([Markup.button.callback(`تعديل: ${order.productName}`, `edit_order_${order.id}`)]);
  }

  summary += `(السعر لم يحدد بعد، يرجى تحديده من لوحة التحكم)`;

  ctx.reply(summary, Markup.inlineKeyboard(buttons));
}

// Handle forwarded messages
bot.on('message', async (ctx, next) => {
  // If manager is in 'editing_order' mode, handle that instead
  if (managerState.mode === 'editing_order' && ctx.message.text && !ctx.message.forward_date) {
    const orderId = managerState.currentData.orderId;
    const oldOrder = await dbService.getOrder(orderId);
    if (!oldOrder) {
      managerState.mode = 'idle';
      return ctx.reply('الطلب غير موجود.');
    }
    
    ctx.reply('جاري التعديل بالذكاء الاصطناعي...');
    const updatedDetails = await editOrderWithAI(oldOrder, ctx.message.text);
    if (updatedDetails) {
      await dbService.updateOrder(orderId, {
        productName: updatedDetails.productName,
        duration: updatedDetails.duration
      });
      
      managerState.mode = 'idle';
      ctx.reply(`تم التعديل بنجاح ✅\nالمنتج: ${updatedDetails.productName}\nالمدة: ${updatedDetails.duration}`);
    } else {
      ctx.reply('حدث خطأ في الذكاء الاصطناعي أثناء التعديل.');
    }
    return;
  }

  if (managerState.mode === 'pay_search_customer' && ctx.message.text && !ctx.message.forward_date) {
    const query = ctx.message.text.toLowerCase();
    const allCustomers = await dbService.getAllCustomers();
    const matches = allCustomers.filter(c => c.name.toLowerCase().includes(query) || c.aliases.some(a => a.toLowerCase().includes(query)));
    
    if (matches.length === 0) {
      return ctx.reply('لم يتم العثور على زبائن بهذا الاسم. حاول مجدداً أو أرسل /cancel للإلغاء.');
    }
    
    const buttons = matches.slice(0, 10).map(c => [Markup.button.callback(`${c.name} (دين: ${c.totalDebt})`, `paycust_${c.id}`)]);
    return ctx.reply('اختر الزبون من القائمة:', Markup.inlineKeyboard(buttons));
  }

  if (managerState.mode === 'pay_enter_amount' && ctx.message.text && !ctx.message.forward_date) {
    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('الرجاء إدخال مبلغ صحيح، أو أرسل /cancel للإلغاء.');
    }
    
    managerState.currentData.amount = amount;
    
    // Fetch wallets
    const { db } = require('./firebase');
    const snapshot = await db.collection('wallets').get();
    if (snapshot.empty) {
      managerState.mode = 'idle';
      return ctx.reply('لا يوجد محافظ مسجلة لتلقي الدفعة.');
    }
    
    const buttons = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      buttons.push([Markup.button.callback(data.name, `paywallet_${doc.id}`)]);
    });
    
    return ctx.reply(`المبلغ: ${amount}\nاختر المحفظة التي استلمت عليها الدفعة:`, Markup.inlineKeyboard(buttons));
  }

  if (ctx.message.forward_date) {
    let senderName = ctx.message.forward_sender_name;
    if (!senderName && ctx.message.forward_from) {
      senderName = ctx.message.forward_from.first_name + (ctx.message.forward_from.last_name ? ' ' + ctx.message.forward_from.last_name : '');
    }

    if (!senderName) {
      return ctx.reply('تعذر معرفة اسم المرسل الأصلي. ربما إعدادات الخصوصية تمنع ذلك.');
    }

    const messageText = ctx.message.text || ctx.message.caption || '';
    
    // Handle Images
    let imagePart = null;
    if (ctx.message.photo && ctx.message.photo.length > 0) {
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Highest resolution
        const link = await ctx.telegram.getFileLink(photo.file_id);
        const response = await axios.get(link.href, { responseType: 'arraybuffer' });
        const base64Str = Buffer.from(response.data).toString('base64');
        imagePart = { mimeType: 'image/jpeg', data: base64Str };
      } catch (err) {
        console.error('Error fetching photo from Telegram:', err);
      }
    }

    if (!messageText && !imagePart) {
      return ctx.reply('الرسالة المحولة لا تحتوي على نص أو صورة.');
    }

    // --- Message Buffering Logic ---
    if (!messageBuffers.has(senderName)) {
      messageBuffers.set(senderName, {
        texts: [],
        images: [],
        timer: null
      });
    }

    const buffer = messageBuffers.get(senderName);
    if (messageText) buffer.texts.push(messageText);
    if (imagePart) buffer.images.push(imagePart);

    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    buffer.timer = setTimeout(async () => {
      // Process the buffer
      const finalBuffer = messageBuffers.get(senderName);
      messageBuffers.delete(senderName);

      const combinedText = finalBuffer.texts.map((t, i) => `[الرسالة ${i+1}]:\n${t}`).join('\n\n');
      const imageParts = finalBuffer.images;
      const { v4: uuidv4 } = require('uuid');
      const batchId = uuidv4(); // Generate context ID

      // Check DB for customer
      const customers = await dbService.findCustomerByName(senderName);

      if (customers.length === 1) {
        await processOrderForCustomer(ctx, customers[0].id, customers[0].name, combinedText, imageParts, batchId);
      } else {
        pendingActions.set(batchId, {
          senderName,
          messageText: combinedText,
          imageParts,
          batchId
        });

        const buttons = [
          [Markup.button.callback('➕ إضافة كزبون جديد', `newcust_${batchId}`)],
          [Markup.button.callback('🔗 ربط مع زبون موجود', `linkexist_${batchId}`)]
        ];

        ctx.reply(`الاسم المستخرج من الرسالة: "${senderName}"\nلم يتم العثور على تطابق تام، ماذا تريد أن تفعل؟`, Markup.inlineKeyboard(buttons));
      }
    }, BUFFER_TIMEOUT);
    
    return;
  }
  
  next();
});

// Action Handlers
bot.action(/^newcust_(.+)$/, async (ctx) => {
  const batchId = ctx.match[1];
  const data = pendingActions.get(batchId);
  if (!data) return ctx.reply('انتهت صلاحية الجلسة أو لا يوجد بيانات.');
  
  pendingActions.delete(batchId);

  ctx.reply('جاري إضافة الزبون...');
  const newCustomer = await dbService.createCustomer(data.senderName);
  
  await processOrderForCustomer(ctx, newCustomer.id, newCustomer.name, data.messageText, data.imageParts, data.batchId);
});

bot.action(/^linkexist_(.+)$/, async (ctx) => {
  const batchId = ctx.match[1];
  const data = pendingActions.get(batchId);
  if (!data) return ctx.reply('انتهت صلاحية الجلسة أو لا يوجد بيانات.');
  
  // Save batchId in managerState to continue linking
  managerState.mode = 'link_to_customer';
  managerState.currentData = { batchId };
  
  // Show list of all customers (or maybe top 20)
  const allCustomers = await dbService.getAllCustomers();
  const buttons = allCustomers.slice(0, 30).map(c => [Markup.button.callback(c.name, `linkto_${c.id}`)]);
  
  ctx.editMessageText('اختر الزبون للربط معه:', Markup.inlineKeyboard(buttons));
});

bot.action(/^linkto_(.+)$/, async (ctx) => {
  const customerId = ctx.match[1];
  if (managerState.mode !== 'link_to_customer' || !managerState.currentData) {
    return ctx.reply('لا يوجد رسالة معلقة.');
  }

  const { batchId } = managerState.currentData;
  const data = pendingActions.get(batchId);
  
  managerState.mode = 'idle';
  managerState.currentData = null;
  
  if (!data) return ctx.reply('انتهت صلاحية الجلسة أو لا يوجد بيانات.');
  pendingActions.delete(batchId);

  await dbService.addAliasToCustomer(customerId, data.senderName);
  
  // Fetch customer name
  const allCustomers = await dbService.getAllCustomers();
  const customer = allCustomers.find(c => c.id === customerId);

  await processOrderForCustomer(ctx, customerId, customer ? customer.name : 'Unknown', data.messageText, data.imageParts, data.batchId);
});

bot.action(/^edit_order_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  managerState.mode = 'editing_order';
  managerState.currentData = { orderId };
  ctx.reply('حسناً، أرسل التعديل الذي تريده الآن نصياً (مثلاً: غير المدة لتصبح سنة).');
});

// Financial Commands
bot.command('wallets', async (ctx) => {
  const { db } = require('./firebase');
  const snapshot = await db.collection('wallets').get();
  if (snapshot.empty) return ctx.reply('لا يوجد محافظ.');
  let text = 'المحافظ:\n';
  snapshot.forEach(doc => {
    const data = doc.data();
    text += `- ${data.name}: ${data.balance}\n`;
  });
  ctx.reply(text);
});

bot.command('add_wallet', async (ctx) => {
  const name = ctx.message.text.split(' ').slice(1).join(' ');
  if (!name) return ctx.reply('يرجى تحديد اسم المحفظة. مثال: /add_wallet محفظة كاش');
  
  const { db } = require('./firebase');
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  await db.collection('wallets').doc(id).set({ name, balance: 0, createdAt: new Date().toISOString() });
  ctx.reply(`تم إضافة المحفظة: ${name}`);
});

bot.command('cancel', (ctx) => {
  managerState.mode = 'idle';
  managerState.currentData = null;
  ctx.reply('تم إلغاء العملية الحالية.');
});

bot.command('pay', (ctx) => {
  managerState.mode = 'pay_search_customer';
  managerState.currentData = {};
  ctx.reply('أرسل اسم الزبون للبحث عنه:');
});

bot.action(/^paycust_(.+)$/, async (ctx) => {
  const customerId = ctx.match[1];
  if (managerState.mode !== 'pay_search_customer') return ctx.reply('عذراً، العملية غير صالحة حالياً.');
  
  managerState.mode = 'pay_enter_amount';
  managerState.currentData = { customerId };
  ctx.reply('تم اختيار الزبون. الرجاء إرسال مبلغ الدفعة (أرقام فقط):');
});

bot.action(/^paywallet_(.+)$/, async (ctx) => {
  const walletId = ctx.match[1];
  if (managerState.mode !== 'pay_enter_amount' || !managerState.currentData || !managerState.currentData.amount) {
    return ctx.reply('عذراً، العملية غير صالحة حالياً.');
  }
  
  const { customerId, amount } = managerState.currentData;
  managerState.mode = 'idle';
  managerState.currentData = null;
  
  const { db } = require('./firebase');
  const { v4: uuidv4 } = require('uuid');
  
  try {
    await db.runTransaction(async (t) => {
      const custRef = db.collection('customers').doc(customerId);
      const wallRef = db.collection('wallets').doc(walletId);
      
      const custDoc = await t.get(custRef);
      const wallDoc = await t.get(wallRef);

      const newDebt = (custDoc.data().totalDebt || 0) - amount;
      const newBalance = (wallDoc.data().balance || 0) + amount;

      t.update(custRef, { totalDebt: newDebt });
      t.update(wallRef, { balance: newBalance });

      const txId = uuidv4();
      t.set(db.collection('transactions').doc(txId), {
        type: 'payment',
        customerId,
        walletId,
        amount,
        createdAt: new Date().toISOString(),
        description: `دفعة من ${custDoc.data().name} عبر البوت`
      });
    });
    ctx.editMessageText('تم تسجيل الدفعة بنجاح وتحديث ديون الزبون ورصيد المحفظة! ✅');
  } catch (error) {
    ctx.reply('حدث خطأ أثناء تسجيل الدفعة: ' + error.message);
  }
});

module.exports = bot;
