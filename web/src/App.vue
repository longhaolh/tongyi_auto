<script setup>
import { ref, reactive, onMounted } from "vue";
const Question = ref('')
const Questions = ref([])
const QuestionsIndex = ref(0)
const wsObj = reactive({})
const Log = ref([])
const fileType = ref([
  {
    value: 'md',
    label: 'Markdown'
  },
  {
    value: 'txt',
    label: 'TXT'
  }
])
const width = ref(0)
const height = ref(0)
const tasking = ref(false)
const taskSetting = ref({ watch: false, fileType: 'md', login: false, taskName: '' })
const uiSetting = ref({ theme: 'dark', showLog: true, notice: true })
const startTime = ref('')
onMounted(() => {
  // 获取视口宽度
  width.value =
    window.innerWidth ||
    document.documentElement.clientWidth ||
    document.body.clientWidth;
  // 获取视口高度
  height.value =
    window.innerHeight ||
    document.documentElement.clientHeight ||
    document.body.clientHeight;
  initWebSocket();
  if (!("Notification" in window)) {
    if (uiSetting.value.notice) {
      alert("此浏览器不支持桌面通知");
    }
  } else if (Notification.permission === "granted") {
    console.log('有通知权限')
  } else {
    console.log('无通知权限', Notification.permission)
    if (uiSetting.value.notice) {
      alert('通知权限已被禁用，请在浏览器设置中将本站通知权限开启后再尝试')
    }
  }

})
// 发送通知
const sendNotice = (msg) => {
  if (!msg || !uiSetting.value.notice) return;
  const notification = new Notification(msg);
}

// WS服务
const initWebSocket = () => {
  const ws = new WebSocket("ws://localhost:3001");
  wsObj.value = ws;
  //接受数据
  ws.onmessage = function (msg) {
    let res = JSON.parse(msg.data);
    if (res.status === 'continue') {
      Log.value.push(res);
      QuestionsIndex.value++;
      if (QuestionsIndex.value < Questions.value.length) {
        // 请求下一个问题
        begin();
      }
    } else if (res.status === 'finish') {
      //任务完成
      QuestionsIndex.value = 0;
      sendNotice(`${taskSetting.value.taskName} 任务已完成，总耗时${new Date().getSeconds() - startTime.value}秒，请在output文件夹中查看`)
      tasking.value = false;
    } else {
      // 显示日志时间 格式 hh:mm:ss:ms
      const date = new Date();
      const time = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`;
      res.time = time;
      Log.value.push(res);
    }
  };
  ws.onopen = function () {
    Log.value.push({
      msg: "检测到WS服务启动成功,准备连接WS服务器...",
      type: "log",
    });
  };

  ws.onclose = function () {
    //在ws关闭时，尝试进行重连
    Log.value.push({
      msg: "WebSocket连接关闭，正在尝试重新连接...如未启动服务请先使用nodemon app指令启动服务",
      type: "error",
    });
    setTimeout(function () {
      initWebSocket();
    }, 1000); //1秒后重新连接，实现重连机制
  };
}
// 启动自动化
const begin = () => {
  if (tasking.value) {
    ElMessage({
      message: '任务尚未完成,无法操作',
      type: 'warning',
    })
    return
  }
  if (!Questions.value.length && !Question.value) {
    ElMessage({
      message: '问题队列为空!',
      type: 'warning',
    })
    return
  };
  if (taskSetting.value.taskName === '') {
    ElMessage({
      message: '请输入任务标题再开始',
      type: 'warning',
    })
    return
  };
  tasking.value = true;
  const data = {
    width: width.value,
    height: height.value,
    Questions: Question.value.split('&'),
    QuestionsIndex: QuestionsIndex.value,
    config: taskSetting.value,
  };
  //发送数据
  wsObj.value.send(JSON.stringify(data));
  startTime.value = new Date().getSeconds();
}
</script>

<template>
  <div class="container">
    <!-- 配置区 -->
    <div class="config-area">
      <div>
        任务标题:
        <el-input autofocus aria-label="任务标题:" v-model="taskSetting.taskName" style="width: 44vw"
          placeholder="请输入本次任务标题,回答会存储在这个名称的文件下" minlength="1" />
      </div>
      <el-switch v-model="uiSetting.notice" size="default" active-text="任务完成桌面通知（推荐打开）" inactive-text="" />
      <el-switch v-model="taskSetting.watch" size="default" active-text="观察提问过程(不推荐开启,会频繁打开浏览器且窗口必须聚焦时通义千问才会响应)"
        inactive-text="" />
      <!-- <el-switch v-model="taskSetting.login" size="default" active-text="登录通义千问查询(不推荐,需要登录自己的账号,且需要强制开启观察模式)"
        inactive-text="" /> -->
      <div>
        选择输出文件类型:
        <el-select v-model="taskSetting.fileType" placeholder="选择输出文件类型" size="large" style="width: 240px">
          <el-option v-for="item in fileType" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
    </div>
    <!-- 问题区 -->
    <div class="question-area">
      <el-input v-model="Question" :rows="10" type="textarea" placeholder="输入问题,多个问题使用&隔开" />
    </div>
    <!-- 执行日志 -->
    <div class="log-area">
      <p class="log" v-for="(item, index) in Log" :key="index"
        :class="{ error: item.type == 'error', log: item.type == 'log', response: item.type == 'response' }">
        <span class="log_time">{{ item.time }}</span> {{ item.msg }}
      </p>
    </div>
    <!-- 开始按钮 -->
    <button @click="begin" class="button">
      Start
      <div id="clip">
        <div id="leftTop" class="corner"></div>
        <div id="rightBottom" class="corner"></div>
        <div id="rightTop" class="corner"></div>
        <div id="leftBottom" class="corner"></div>
      </div>
      <span id="rightArrow" class="arrow"></span>
      <span id="leftArrow" class="arrow"></span>
    </button>
  </div>
</template>

<style scoped lang="scss">
@import "./style.scss";
</style>
