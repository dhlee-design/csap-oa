// .env가 없으면 .env.example을 복사해 만든다.
// 저장소를 처음 받은 PC에서 별도 설정 없이 npm run setup / dev / start가 되도록 하기 위함.
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log(".env 파일이 없어 .env.example로 만들었습니다. (DB·증적·양식 파일은 data/ 폴더에 저장됩니다)");
}
