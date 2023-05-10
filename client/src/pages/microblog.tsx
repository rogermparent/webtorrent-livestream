import React from "react";

interface Attachment {
  url: string;
}

interface MicroblogPost {
  text: string;
  attachments?: Attachment[];
}

const blogData: MicroblogPost[] = [
  { text: "This is an example post!" },
  { text: "This is another!" },
];

const MicroblogPage = () => {
  return (
    <div>
      <h1>Microblog</h1>
      {blogData.map(({ text }, i) => (
        <div key={i}>
          <div>{text}</div>
        </div>
      ))}
    </div>
  );
};

export default MicroblogPage;
