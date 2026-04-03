import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

console.log('Welcome to codexapp. GitHub: https://github.com/Qjzn/codexui-server-bridge')

createApp(App).use(router).mount('#app')
