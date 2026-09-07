# UF-103 delete bot

createBot id=uf103-shanwo
routineCreate id=r-1788693379830-q8mubx9l
memory dir before=True
deleteBot ok=True
memory dir after=False
routine leftover=[]

Live delete used the then-current host: routine row was **removed** (not in `routineList`).
Code now `update({enabled:false})` + disarm (INV / 2.7). Re-verify after next gateway boot.
Memory dir gone: PASS.
