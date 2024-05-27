var app = require('express')();
var cors = require('cors');
var puppeteer = require('puppeteer');
var fs = require('fs');
var path = require('path');
const serverPort = 3000;
const wsPort = 3001;
const wsUrl = `ws://localhost:${wsPort}`;
function stringify(obj) {
    if (typeof obj != 'object') {
        return obj;
    }
    return JSON.stringify(obj);
}
app.use(cors());
//建立WebSocket链接
var WebSocket = require('ws');
var wss = new WebSocket.Server({ port: wsPort }); // 监听指定端口
var dataJSON = {};
var wsObj = null;
wss.on('connection', function (ws) {
    ws.send(stringify({ msg: 'WS服务连接成功', type: 'log' }));
    wsObj = ws;
    ws.on('message', async function (data) {
        dataJSON = JSON.parse(data);
        console.log(`收到客户端的数据: ${data}`);
        if (!browser) {
            await prepareBrowserAndPage();  // 初始化浏览器和页面
        }

    });
});
var browser;
var page;
/**
 * 初始化Puppeteer实例
 */
async function prepareBrowserAndPage() {
    // 启动Puppeteer浏览器实例
    try {
        browser = await puppeteer.launch({
            headless: !dataJSON.config.watch,
            args: [
                '--start-maximized' // 启动时最大化窗口
            ]
        });
        wsObj.send(stringify({ msg: '环境满足...', type: "log" }))
    } catch {
        wsObj.send(stringify({ msg: "浏览器启动失败!请下载或更新Chrome浏览器到最新版", type: "error" }))
        return
    }
    try {
        page = await browser.newPage();

        wsObj.send(stringify({ msg: '实例已经创建...', type: "log" }))
    } catch {
        wsObj.send(stringify({ msg: "实例创建失败...", type: "error" }))
        return
    }
    if (dataJSON.config.watch) {
        // 设置浏览器窗口大小
        await page.setViewport({ width: dataJSON.width, height: dataJSON.height });
        wsObj.send(stringify({ msg: '视口大小修改完毕...', type: "log" }))
    }
    // 打开通义千问
    try {
        await page.goto('https://tongyi.aliyun.com/qianwen', { waitUntil: 'networkidle0' });
        wsObj.send(stringify({ msg: '正在前往通义千问官网...', type: "log" }))
    } catch {
        wsObj.send(stringify({ msg: "网站打开超时,请检查网络或者提高超时阈值...", type: "error" }))
        return
    }
    run();
}
/// 自动化提问函数
async function mainThread() {
    wsObj.send(stringify({ msg: `任务开始,本次问题：${dataJSON.Questions[dataJSON.QuestionsIndex]}`, type: "log" }))
    wsObj.send(stringify({ msg: `剩余问题个数：${dataJSON.Questions.length - (dataJSON.QuestionsIndex + 1)}`, type: "log" }))
    // 获取textarea标签
    try {
        await page.waitForSelector('textarea');
        wsObj.send(stringify({ msg: '获取输入框成功...', type: "log" }))
    } catch {
        wsObj.send(stringify({ msg: "获取输入框超时,请检查网络或者提高超时阈值...", type: "error" }))
    }
    // 获取弹框关闭按钮 closeIcon--
    // try {
    //     await page.waitForSelector('[class^="closeIcon"]');
    //     wsObj.send(stringify({ msg: '获取弹框关闭按钮成功...', type: "log" }))
    // } catch {
    //     wsObj.send(stringify({ msg: "获取弹框关闭按钮超时...", type: "error" }))
    // }
    try {
        await page.click('[class*="closeIcon"]');
        wsObj.send(stringify({ msg: '弹框已关闭...', type: "log" }));
    } catch {
        wsObj.send(stringify({ msg: "弹框关闭失败...", type: "error" }))
    }
    var text = dataJSON.Questions[dataJSON.QuestionsIndex];
    // 向textarea输入文本
    try {
        await page.type('textarea', text);
        wsObj.send(stringify({ msg: '正在输入提问内容...', type: "log" }))
    } catch {
        wsObj.send(stringify({ msg: "输入内容失败,请检查提问内容...", type: "error" }))
    }
    try {
        await page.waitForSelector('[class^="operateBtn--"]');
        wsObj.send(stringify({ msg: '获取提交按钮成功...', type: "log" }))
    } catch {
        wsObj.send(stringify({ msg: "获取提交按钮超时...", type: "error" }))
    }
    try {
        // setTimeout(async () => {
            await page.click('[class*="operateBtn--"]');
        // }, 500)
        wsObj.send(stringify({ msg: '已发送提问请求,可能需要很久响应...', type: "log" }));
    } catch {
        wsObj.send(stringify({ msg: "发送提问请求失败...", type: "error" }))
    } 
    // 监听https://qianwen.biz.aliyun.com/dialog/guest/conversation的eventstrem请求
    page.on('response', async (response) => {
        const url = response.url();
        // 检查URL是否是我们感兴趣的EventStream
        if (url.includes('https://qianwen.biz.aliyun.com/dialog/guest/conversation')) {
            const contentType = response.headers()['content-type'];
            // 确保响应类型为EventStream
            if (contentType && contentType.includes('text/event-stream')) {
                // 从响应中读取数据
                const text = await response.text();
                wsObj.send(stringify({ msg: '服务器响应完毕,准备写入...', type: "log" }));
                //处理响应数据
                const jsonStrArray = text.split("\n\n");
                const dataObjects = jsonStrArray.map((jsonStr) => {
                    try {
                        const cleanJsonStr = jsonStr.replace("data: ", "");
                        return JSON.parse(cleanJsonStr);
                    } catch (error) {
                        return { error: error.message };
                    }
                });
                const filteredDataObjects = dataObjects.filter((obj) => !obj.error);

                // 检测output是否存在,没有就创建
                if (!fs.existsSync('output')) {
                    fs.mkdirSync('output');
                }

                filteredDataObjects.forEach((item) => {
                    if (item.msgStatus === "finished") {
                        item.contents.forEach(e => {
                            if (e.contentType === "text" && e.role === 'assistant') {
                                if (dataJSON.config.fileType === 'md') {
                                    const filePath = path.join('output', `${dataJSON.config.taskName}.md`);
                                    const dataToWrite = `## ${dataJSON.Questions[dataJSON.QuestionsIndex]}\n ${e.content.replaceAll('###', "")}\n\n\n`;
                                    // 将响应数据写入文件
                                    fs.appendFile(filePath, dataToWrite, 'utf8', function (err) {
                                        if (err) {
                                            wsObj.send(stringify({ msg: "输出文件创建失败,可以重启项目再尝试..." + err, type: "error" }));
                                        } else {
                                            wsObj.send(stringify({ msg: `已成功写入数据到 ${filePath}`, type: "log" }));
                                            // 检查任务队列是否还有未完成的
                                            dataJSON.QuestionsIndex++; // 任务完成,索引+1
                                            browser.close();
                                            // 重置浏览器和页面
                                            browser = null;
                                            page = null;
                                            if (dataJSON.QuestionsIndex >= dataJSON.Questions.length) {
                                                // 所有任务已完成则关闭浏览器
                                                dataJSON = null
                                                wsObj.send(stringify({ msg: "任务已完成", type: "log", status: 'over' }));
                                            } else {
                                                // 任务未完成则继续执行
                                                wsObj.send(stringify({ msg: "开始下一个任务...", type: "log", status: 'over' }));
                                                prepareBrowserAndPage();
                                            }
                                        }
                                    });
                                } else {
                                    // 生成文件名
                                    const safeFileName = dataJSON.Questions[dataJSON.QuestionsIndex];
                                    const filePath = path.join('output', `${safeFileName}.txt`);
                                    // 处理e.content 去除所有md字符
                                    e.content = e.content.replace(/[*#-]/g, '');
                                    const dataToWrite = `Q: ${dataJSON.Questions[dataJSON.QuestionsIndex]}\nA: ${e.content}\n`;
                                    // 将响应数据写入文件
                                    fs.appendFile(filePath, dataToWrite, 'utf8', function (err) {
                                        if (err) {
                                            wsObj.send(stringify({ msg: "输出文件创建失败..." + err, type: "error" }));
                                        } else {
                                            wsObj.send(stringify({ msg: `已成功写入数据到 ${filePath}`, type: "log" }));
                                            // 关闭浏览器
                                            browser.close();
                                            // 重置浏览器和页面
                                            browser = null;
                                            page = null;
                                            wsObj.send(stringify({ msg: "任务已完成", type: "log", status: 'over' }));
                                        }
                                    });
                                }
                            }
                        });
                    }
                });
            }
        }
    });
}
async function run() {
    // 如果页面没有初始化或浏览器没有启动，则直接返回
    if (!page || !browser) {
        wsObj.send(stringify({
            msg: "页面或浏览器未初始化",
            type: "error"
        }));
        return;
    }
    if (dataJSON.QuestionsIndex > dataJSON.Questions.length) {
        console.log('dataJSON', stringify(dataJSON))
        wsObj.send(stringify({ msg: "任务结束,请查看output文件夹", type: "log", status: 'over' }));
        browser.close();
        browser = null;
        page = null;
        return
    }
    if (!dataJSON.config.login) {
        mainThread()
    } else {
        wsObj.send(stringify({ msg: "请在120秒内完成登录...", type: "log" }))
        // 等待出现指定的cookie值
        var waitForCookie = async (name, timeout = 120000) => {
            var checkInterval = 1000; // 每次检查之间等待1000毫秒（1秒）
            let elapsed = 0; // 已过时间
            while (elapsed < timeout) {
                var cookies = await page.cookies();
                var targetCookie = cookies.find(cookie => cookie.name === name);
                if (targetCookie) {
                    return targetCookie; // 如果找到了目标cookie，返回它
                }
                // 等待checkInterval定义的时间再进行下一次检查
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                elapsed += checkInterval; // 更新已过时间
            }
            // 如果超时还没有找到，抛出错误
            throw new Error(`长时间未检测到登录信息,自动退出`);
        };
        try {
            var myCookie = await waitForCookie('login_tongyi_ticket');
            // 检测到已登录,开始执行任务
            mainThread()
            try {
                await page.waitForSelector('[class^="chatItem--"]');
                await page.waitFor(1000);
            } catch {
                wsObj.send(stringify({ msg: "获取输入框超时,请检查网络或者提高超时阈值...", type: "error" }))
            }
        } catch (error) {
            console.error(error.message);
        }
    }
}

app.listen(serverPort, () => {
    console.log(`服务端已运行在http://localhost:${serverPort},ws地址为${wsUrl}`);
});