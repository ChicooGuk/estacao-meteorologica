# A conexao e a reconexao sao gerenciadas pela tarefa assincrona em main.py.
import gc
import network
import config
network.WLAN(network.STA_IF).active(True)
gc.collect()
