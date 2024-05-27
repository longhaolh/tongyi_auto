// vite.config.ts
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [
    vue(),
    // 自动按需导入 Vue APIs、ElementPlus 组件、Emits 等
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    // 自动按需导入 ElementPlus 组件
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
})