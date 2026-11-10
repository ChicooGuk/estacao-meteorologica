# A conexao e a reconexao sao gerenciadas pela tarefa assincrona em main.py.
import gc
import network
import config
network.WLAN(network.STA_IF).active(True)
try:
    import webrepl
    webrepl.start()
except Exception as exc:
    print('[WEBREPL] Indisponivel:', exc)
gc.collect()
